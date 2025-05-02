# Piano Analytics Tag for Google Tag Manager Server-Side

The **Piano Analytics Tag for GTM Server-Side** allows you to send events directly to Piano Analytics from your server container. This tag supports both Piano Analytics and GA4 schemas, automatically mapping event names and formatting parameters accordingly.

It's designed to integrate seamlessly with the [Piano Analytics Client by Stape](https://github.com/stape-io/piano-client).

## How to Use

1. Add the **Piano Analytics Tag** to your Server GTM container from the Template Gallery.
2. Set the **Collection Domain** (e.g., `xxxx.pa-cd.com`).
3. Provide the **Site ID** (optional – will be inherited from the incoming request if not set).
4. Set the **Visitor ID** (optional – inherited from incoming request if not set).
5. Choose the **Event Name Setup Method**:
   - **Inherit from client** – uses the event name from the incoming request. GA4 event names are automatically mapped to Piano Analytics equivalents.
   - **Custom** – define your own event name manually.
6. (Optional) Configure options like **Redact Visitor IP** and **Use Optimistic Scenario**.
7. Add or modify event parameters, and specify any to exclude.
8. (Optional) Enable logging to **Console** and/or **BigQuery**.

## Supported Event Name Mapping

The recommended incoming request format to be used in conjunction with this tag is the Piano Analytics schema, which can be parsed and claimed by the **[Piano Analytics Client by Stape](https://github.com/stape-io/piano-client)**. This tag seamless integrate with it.

However, it also supports the GA4 schema.
When using the **inherit** method with a GA4 event schema, the following mappings will be applied:

| GA4 Event                | Piano Analytics Equivalent     |
|--------------------------|--------------------------------|
| `page_view`              | `page.display`                |
| `search`, `view_search_results` | `internal_search_result.display` |
| `view_item_list`         | `product.display`             |
| `view_item`              | `product.page_display`        |
| `add_to_cart`            | `product.add_to_cart`         |
| `remove_from_cart`       | `product.remove_from_cart`    |
| `view_cart`              | `cart.display`  and `product.display`                |
| `add_shipping_info`      | `cart.delivery`               |
| `add_payment_info`       | `cart.payment`                |
| `purchase`               | `transaction.confirmation` and `product.purchased`    |
| `view_promotion`         | `self_promotion.impression`   |
| `select_promotion`       | `self_promotion.click`        |

## Required Fields

- **Collection Domain** – Found in Piano's dashboard under *Tagging → Collection Domains*.
- **Site ID** – Found in Piano's dashboard under the *ID* column of the desired site. If not set, it will inherit from the Event Data parameter `x-pa-site-id` generated the by [Piano Analytics Client by Stape](https://github.com/stape-io/piano-client).
- **Visitor ID** – Must be a 16-character string or a UUID. If not set, it will inherit from the Event Data parameters `client_id` or `x-pa-idclient` generated the by [Piano Analytics Client by Stape](https://github.com/stape-io/piano-client).
- **Event Name** – Either inherited or custom.

## Event Parameters

- You can add, overwrite, or exclude event parameters.
- For ecommerce events, **`cart_id`** is essential.
  - If not set explicitly, the tag will fallback to `transaction_id`, though this is not recommended.

## Logging Options

- **Console Logging**: Log all events to the browser console during preview/debug or always.
- **BigQuery Logging**: Log event payloads, request details, and responses to a specified BigQuery table.

## Benefits of Using Server-Side Tracking with Piano Analytics

- ✅ **More Accurate Data** – Bypasses browser-level restrictions.
- 🔐 **Stronger Privacy Compliance** – Greater control over what data is collected and stored.
- 🚀 **Faster Website Load** – Reduces reliance on JavaScript in the browser.

## Useful Resources

- [Piano Analytics Client by Stape](https://github.com/stape-io/piano-client)
- [Piano Analytics Developer Docs](https://developers.atinternet-solutions.com/piano-analytics/data-collection/general/how-it-works)
- [Piano Analytics Collection API Reference](https://developers.atinternet-solutions.com/piano-analytics/data-collection/how-to-send-events/collection-api)
- [Piano Analytics Standard Events Reference](https://developers.atinternet-solutions.com/piano-analytics/data-collection/how-to-send-events/standard-events/)
- [Piano Analytics Ecommerce Events Reference](https://developers.atinternet-solutions.com/piano-analytics/data-collection/how-to-send-events/sales-insights/)

## Open Source

The **Piano Analytics Tag for GTM Server-Side** is developed and maintained by the [Stape Team](https://stape.io/) under the Apache 2.0 license.
