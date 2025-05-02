const BigQuery = require('BigQuery');
const encodeUriComponent = require('encodeUriComponent');
const getAllEventData = require('getAllEventData');
const getContainerVersion = require('getContainerVersion');
const getRequestHeader = require('getRequestHeader');
const getTimestampMillis = require('getTimestampMillis');
const getType = require('getType');
const JSON = require('JSON');
const logToConsole = require('logToConsole');
const makeInteger = require('makeInteger');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const sendHttpRequest = require('sendHttpRequest');

/**********************************************************************************************/

const traceId = getRequestHeader('trace-id');

const eventData = getAllEventData();

const useOptimisticScenario = isUIFieldTrue(data.useOptimisticScenario);

const url = eventData.page_location || getRequestHeader('referer');
if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) {
  return data.gtmOnSuccess();
}

let mappedEventData = mapEventData(data, eventData);
mappedEventData = validateMappedEventData(mappedEventData);

if (!mappedEventData.length) {
  return data.gtmOnFailure();
}

sendRequest(mappedEventData);

if (useOptimisticScenario) {
  return data.gtmOnSuccess();
}

/**********************************************************************************************/
// Vendor related functions

function mapEventName(data, eventData) {
  if (data.eventType === 'inherit') {
    const eventName = eventData.event_name;
    const DEFAULT_GA_TO_PA_EVENTS_MAPPING = {
      // Standard events
      page_view: 'page.display',
      search: 'internal_search_result.display',
      view_search_results: 'internal_search_result.display',
      // Ecommerce events
      view_item_list: 'product.display',
      view_item: 'product.page_display',
      add_to_cart: 'product.add_to_cart',
      remove_from_cart: 'product.remove_from_cart',
      view_cart: 'cart.display',
      add_shipping_info: 'cart.delivery',
      add_payment_info: 'cart.payment',
      purchase: 'transaction.confirmation',
      view_promotion: 'self_promotion.impression',
      select_promotion: 'self_promotion.click'
    };

    if (DEFAULT_GA_TO_PA_EVENTS_MAPPING[eventName]) {
      return DEFAULT_GA_TO_PA_EVENTS_MAPPING[eventName];
    }

    return eventName;
  }

  return data.eventName;
}

function mapChildEventName(parentEventName) {
  const DEFAULT_PA_PARENT_TO_PA_CHILD_EVENTS_MAPPING = {
    'transaction.confirmation': 'product.purchased',
    'cart.display': 'product.display'
  };

  return DEFAULT_PA_PARENT_TO_PA_CHILD_EVENTS_MAPPING[parentEventName];
}

function addNonPAEcommerceData(eventData, mappedEventData) {
  const event = mappedEventData[0];
  const cartOrTransactionEvent =
    event.name.indexOf('cart.') !== -1 || event.name.indexOf('transaction.') !== -1;

  // self_promotion.* or publisher.* events
  if (eventData.onsitead_type) event.data.onsitead_type = makeString(eventData.onsitead_type);
  if (eventData.creative_name) event.data.onsitead_variant = makeString(eventData.creative_name);
  if (eventData.creative_slot) event.data.onsitead_category = makeString(eventData.creative_slot);
  if (eventData.promotion_id) event.data.onsitead_campaign = makeString(eventData.promotion_id);
  if (eventData.promotion_name) event.data.onsitead_creation = makeString(eventData.promotion_name);
  if (event.name.indexOf('publisher.') === 0 && !eventData.onsitead_type) {
    event.data.onsitead_type = 'Publisher';
  } else if (event.name.indexOf('self_promotion.') === 0 && !eventData.onsitead_type) {
    event.data.onsitead_type = 'Self promotion';
  }

  if (eventData.payment_type) {
    event.data.payment_mode = eventData.payment_type;
  }

  if (eventData.shipping_tier) {
    event.data.shipping_delivery = eventData.shipping_tier;
  }
  if (isValidValue(eventData.shipping)) {
    event.data.shipping_costtaxfree = makeNumber(eventData.shipping);
  }

  if (eventData.coupon) {
    event.data.transaction_promocode =
      getType(eventData.coupon) !== 'array'
        ? makeString(eventData.coupon).split(',')
        : eventData.coupon;
  }

  if (eventData.cart_id) event.data.cart_id = eventData.cart_id;

  if (eventData.transaction_id) {
    event.data.transaction_id = eventData.transaction_id;
    if (!event.data.cart_id) event.data.cart_id = eventData.transaction_id;
  }

  if (cartOrTransactionEvent) {
    const tax = eventData.tax;
    const value = makeNumber(eventData.value);
    const valueIsValid = isValidValue(value);
    if (valueIsValid && tax) {
      event.data.cart_turnovertaxincluded = value + makeNumber(tax);
    } else if (valueIsValid && !tax) {
      event.data.cart_turnovertaxfree = value;
    }
  }

  // items (GA4) to items_list (PA) mapping
  const hasItems = getType(eventData.items) === 'array' && eventData.items.length > 0;
  if (hasItems) {
    // https://developers.atinternet-solutions.com/piano-analytics/data-collection/how-to-send-events/standard-events#batching-similar-events
    event.data.items_list = [];
    const currencyFromItems = eventData.items[0].currency;
    let valueFromItems = 0;
    let itemsTotalQuantity = 0;

    eventData.items.forEach((item) => {
      const listItem = {};

      if (item.item_id) listItem.product_id = makeString(item.item_id);
      if (item.item_name) listItem.product = makeString(item.item_name);
      if (item.item_variant) listItem.product_variant = makeString(item.item_variant);
      if (item.coupon || item.discount) {
        const discount = item.coupon || item.discount;
        listItem.product_discount = getType(discount) !== 'boolean' ? true : discount;
      }
      if (item.item_brand) listItem.product_brand = makeString(item.product_brand);
      if (item.item_category) listItem.product_category1 = makeString(item.item_category);
      if (item.item_category2) listItem.product_category2 = makeString(item.item_category2);
      if (item.item_category3) listItem.product_category3 = makeString(item.item_category3);
      if (item.item_category4) listItem.product_category4 = makeString(item.item_category4);
      if (item.quantity) {
        const quantity = makeInteger(item.quantity);
        listItem.product_quantity = quantity;
        itemsTotalQuantity += quantity || 0;
      }
      if (item.price) {
        const price = makeNumber(item.price);
        const quantity = makeInteger(item.quantity);
        listItem.product_pricetaxfree = makeNumber(price);
        valueFromItems += quantity ? quantity * price : price;
      }

      // self_promotion.* or publisher.* events
      if (item.onsitead_type) listItem.onsitead_type = makeString(item.onsitead_type);
      if (item.creative_name) listItem.onsitead_variant = makeString(item.creative_name);
      if (item.creative_slot) listItem.onsitead_category = makeString(item.creative_slot);
      if (item.promotion_id) listItem.onsitead_campaign = makeString(item.promotion_id);
      if (item.promotion_name) listItem.onsitead_creation = makeString(item.promotion_name);
      if (event.name.indexOf('publisher.') === 0 && !listItem.onsitead_type) {
        listItem.onsitead_type = 'Publisher';
      } else if (event.name.indexOf('self_promotion.') === 0 && !listItem.onsitead_type) {
        listItem.onsitead_type = 'Self promotion';
      }

      event.data.items_list.push(listItem);
    });

    if (!event.data.cart_currency && currencyFromItems) {
      event.data.cart_currency = currencyFromItems;
    }

    if (cartOrTransactionEvent) {
      if (eventData.items.length) event.data.cart_nbdistinctproduct = eventData.items.length;
      if (itemsTotalQuantity) event.data.cart_quantity = itemsTotalQuantity;

      const tax = eventData.tax;
      const valueIsValid = isValidValue(valueFromItems);
      if (valueIsValid && tax) {
        event.data.cart_turnovertaxincluded = valueFromItems + makeNumber(tax);
      } else if (valueIsValid && !tax) {
        event.data.cart_turnovertaxfree = valueFromItems;
      }
    }
  }

  return mappedEventData;
}

function addChildEventDataIfNeeded(mappedEventData) {
  const parentEvent = mappedEventData[0];

  const childEventName = mapChildEventName(parentEvent.name);
  const hasItems =
    getType(parentEvent.data.items_list) === 'array' && parentEvent.data.items_list.length > 0;

  if (childEventName && hasItems) {
    const childEvent = {
      name: childEventName,
      data: mergeObj({}, parentEvent.data) // Copy the data from the parent event
    };

    // Remove the items_list parameter from the parent event.
    parentEvent.data.items_list = undefined;

    mappedEventData.push(childEvent);
  }

  return mappedEventData;
}

function mapEventData(data, eventData) {
  const event = {
    name: mapEventName(data, eventData),
    data: eventData['x-pa-data'] || {
      device_timestamp_utc: makeInteger(getTimestampMillis() / 1000)
    }
  };
  const mappedEventData = [event];

  // Common Event Data
  if (eventData.currency) event.data.cart_currency = eventData.currency;
  if (eventData.language) {
    const language = eventData.language.replace('_', '-').split('-');
    event.data.browser_language = language[0];
    event.data.browser_language_local = language[1];
  }
  if (eventData.page_hostname) event.data.hostname = eventData.page_hostname;
  if (eventData.page_location) event.data.event_url_full = eventData.page_location;
  if (eventData.page_path) event.data.pathname = eventData.page_path;
  if (eventData.page_referrer) event.data.previous_url = eventData.page_referrer;
  if (eventData.page_title) event.data.page_title_html = eventData.page_title;
  if (eventData.screen_resolution) {
    const screenResolution = eventData.screen_resolution.split('x');
    event.data.device_screen_width = makeInteger(screenResolution[0]);
    event.data.device_screen_height = makeInteger(screenResolution[1]);
  }
  if (eventData.user_id) event.data.user_id = eventData.user_id;
  if (eventData.viewport_size) {
    const viewportSize = eventData.viewport_size.split('x');
    event.data.device_display_width = makeInteger(viewportSize[0]);
    event.data.device_display_height = makeInteger(viewportSize[1]);
  }

  // Non-standard Piano Analytics property
  if (isValidValue(eventData.value)) event.data.value = eventData.value;

  // Event Data - Non-default parameters
  if (eventData['x-ga-page_id']) event.data.pageview_id = eventData['x-ga-page_id'];
  if (eventData.search_term) event.data.ise_keyword = eventData.search_term;

  // Adds ecommerce data from incoming requests following the GA4 schema
  addNonPAEcommerceData(eventData, mappedEventData);

  if (data.eventParametersExcludeList) {
    data.eventParametersExcludeList.forEach((p) => {
      if (isValidValue(event.data[p.name])) event.data[p.name] = undefined; // JSON.stringify will get rid of it
    });
  }

  if (data.eventParametersAddOrEditList) {
    data.eventParametersAddOrEditList.forEach((p) => {
      if (isValidValue(p.value)) event.data[p.name] = p.value;
    });
  }

  // Only when using an incoming request that contains an event that produces a child event (e.g. GA4 schema)
  addChildEventDataIfNeeded(mappedEventData);

  return mappedEventData;
}

function validateMappedEventData(mappedEventData) {
  const ECOMMERCE_MANDATORY_PROPERTIES = {
    'product.display': ['product_id'],
    'product.page_display': ['product_id'],
    'product.add_to_cart': ['product_id'],
    'product.remove_from_cart': ['product_id'],
    'cart.creation': ['cart_id'],
    'cart.display': ['cart_id'],
    'cart.update': ['cart_id'],
    'cart.delivery': ['cart_id'],
    'cart.payment': ['cart_id'],
    'transaction.confirmation': ['cart_id', 'transaction_id'],
    'product.purchased': ['cart_id', 'product_id', 'transaction_id']
  };

  // Remove invalid event object from mappedEventData, but do not abort the tag execution in case there are multiple events and not all of them are invalid.
  return mappedEventData.filter((event) => {
    const missingMandatoryProps = { error: false, props: [] };

    const mandatoryProps = ECOMMERCE_MANDATORY_PROPERTIES[event.name];
    if (!mandatoryProps) return true;

    mandatoryProps.forEach((mandatoryProp) => {
      const missingPropAtRootLevel = !isValidValue(event.data[mandatoryProp]);
      const itemsList = event.data.items_list;
      const missingPropAtItemsListLevel = (itemsList || []).some(
        (listItem) => !isValidValue(listItem[mandatoryProp])
      );
      if (
        (missingPropAtRootLevel && !itemsList) ||
        (missingPropAtRootLevel && itemsList && missingPropAtItemsListLevel)
      ) {
        missingMandatoryProps.error = true;
        missingMandatoryProps.props.push(mandatoryProp);
      }
    });

    if (missingMandatoryProps.error) {
      log({
        Name: 'PianoAnalyticsTag',
        Type: 'Message',
        TraceId: traceId,
        EventName: event.name,
        Message: 'Event was not sent.',
        Reason: 'Mandatory parameter(s) missing: ' + missingMandatoryProps.props.join(', ')
      });
      return false;
    }
    return true;
  });
}

function getRequestUrl() {
  let requestUrl =
    'https://' + data.collectionDomain.replace('http://', '').replace('https://', '') + '/event';
  requestUrl += '?s=' + (data.siteId || eventData['x-pa-site-id']);
  requestUrl +=
    '&idclient=' + enc(data.idClient || eventData.client_id || eventData['x-pa-idclient']);

  return requestUrl;
}

function sendRequest(mappedEventData) {
  let requestUrl = getRequestUrl();

  const requestHeaders = { 'Content-Type': 'text/plain' };
  if (!isUIFieldTrue(data.redactIpAddress) && eventData.ip_override) {
    requestHeaders['X-Forwarded-For'] = eventData.ip_override;
  }
  if (eventData.user_agent) {
    requestHeaders['User-Agent'] = eventData.user_agent;
  }
  if (mappedEventData[0].data.event_url_full) {
    // https://developers.atinternet-solutions.com/piano-analytics/data-collection/how-to-send-events/collection-api
    // "Address of the page sending the data"
    requestHeaders['Referer'] = mappedEventData[0].data.event_url_full;
  }

  const requestBody = {
    events: mappedEventData
  };

  const eventNames = mappedEventData.map((e) => e.name).join('|');
  log({
    Name: 'PianoAnalyticsTag',
    Type: 'Request',
    TraceId: traceId,
    EventName: eventNames,
    RequestMethod: 'POST',
    RequestUrl: requestUrl,
    RequestHeaders: requestHeaders,
    RequestBody: requestBody
  });

  sendHttpRequest(
    requestUrl,
    {
      headers: requestHeaders,
      method: 'POST'
    },
    JSON.stringify(requestBody)
  )
    .then((response) => {
      log({
        Name: 'PianoAnalyticsTag',
        Type: 'Response',
        TraceId: traceId,
        EventName: eventNames,
        ResponseStatusCode: response.statusCode,
        ResponseHeaders: response.headers,
        ResponseBody: response.body
      });

      if (!useOptimisticScenario) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          data.gtmOnSuccess();
        } else {
          data.gtmOnFailure();
        }
      }
    })
    .catch(() => {
      if (!useOptimisticScenario) {
        data.gtmOnFailure();
      }
    });
}

/**********************************************************************************************/
// Helpers

function enc(data) {
  return encodeUriComponent(makeString(data || ''));
}

function mergeObj(target, source) {
  for (const key in source) {
    if (source.hasOwnProperty(key)) target[key] = source[key];
  }
  return target;
}

function isValidValue(value) {
  const valueType = getType(value);
  return valueType !== 'null' && valueType !== 'undefined' && value !== '';
}

function isUIFieldTrue(field) {
  return [true, 'true'].indexOf(field) !== -1;
}

function log(rawDataToLog) {
  const logDestinationsHandlers = {};
  if (determinateIsLoggingEnabled()) logDestinationsHandlers.console = logConsole;
  if (determinateIsLoggingEnabledForBigQuery()) logDestinationsHandlers.bigQuery = logToBigQuery;

  // Key mappings for each log destination
  const keyMappings = {
    // No transformation for Console is needed.
    bigQuery: {
      Name: 'tag_name',
      Type: 'type',
      TraceId: 'trace_id',
      EventName: 'event_name',
      RequestMethod: 'request_method',
      RequestUrl: 'request_url',
      RequestBody: 'request_body',
      ResponseStatusCode: 'response_status_code',
      ResponseHeaders: 'response_headers',
      ResponseBody: 'response_body'
    }
  };

  for (const logDestination in logDestinationsHandlers) {
    const handler = logDestinationsHandlers[logDestination];
    if (!handler) continue;

    const mapping = keyMappings[logDestination];
    const dataToLog = mapping ? {} : rawDataToLog;
    // Map keys based on the log destination
    if (mapping) {
      for (const key in rawDataToLog) {
        const mappedKey = mapping[key] || key; // Fallback to original key if no mapping exists
        dataToLog[mappedKey] = rawDataToLog[key];
      }
    }

    handler(dataToLog);
  }
}

function logConsole(dataToLog) {
  logToConsole(JSON.stringify(dataToLog));
}

function logToBigQuery(dataToLog) {
  const connectionInfo = {
    projectId: data.logBigQueryProjectId,
    datasetId: data.logBigQueryDatasetId,
    tableId: data.logBigQueryTableId
  };

  // timestamp is required.
  dataToLog.timestamp = getTimestampMillis();

  // Columns with type JSON need to be stringified.
  ['request_body', 'response_headers', 'response_body'].forEach((p) => {
    // GTM Sandboxed JSON.parse returns undefined for malformed JSON but throws post-execution, causing execution failure.
    // If fixed, could use: dataToLog[p] = JSON.stringify(JSON.parse(dataToLog[p]) || dataToLog[p]);
    dataToLog[p] = JSON.stringify(dataToLog[p]);
  });

  // assertApi doesn't work for 'BigQuery.insert()'. It's needed to convert BigQuery into a function when testing.
  // Ref: https://gtm-gear.com/posts/gtm-templates-testing/
  const bigquery =
    getType(BigQuery) === 'function' ? BigQuery() /* Only during Unit Tests */ : BigQuery;
  bigquery.insert(connectionInfo, [dataToLog], { ignoreUnknownValues: true });
}

function determinateIsLoggingEnabled() {
  const containerVersion = getContainerVersion();
  const isDebug = !!(
    containerVersion &&
    (containerVersion.debugMode || containerVersion.previewMode)
  );

  if (!data.logType) {
    return isDebug;
  }

  if (data.logType === 'no') {
    return false;
  }

  if (data.logType === 'debug') {
    return isDebug;
  }

  return data.logType === 'always';
}

function determinateIsLoggingEnabledForBigQuery() {
  if (data.bigQueryLogType === 'no') return false;
  return data.bigQueryLogType === 'always';
}
