# Stripe Payment Link Setup

This site is a static GitHub Pages website. It uses Stripe-hosted Payment Links; it does not create Checkout Sessions or need a server-side Stripe API key.

## Values to Replace

The following values are empty and must be set before checkout is available.

**Files containing placeholders:**
- [coaching-checkout-config.js](coaching-checkout-config.js)

| Field | Current Value | What to Set |
|-------|---------------|-------------|
| `single` | `""` | The public Stripe Payment Link for one 60-minute lesson, priced at $60 USD. |
| `package` | `""` | The public Stripe Payment Link for four 60-minute lessons, priced at $200 USD. |

Use the public `https://buy.stripe.com/...` URL for each link. Stripe Dashboard product URLs and draft checkout URLs cannot be used here. Keep adjustable quantity disabled.

## Configured Parameters

Checkout Studio's Checkout Session parameters do not apply to this Payment Link integration. There is no Checkout Session API call, Stripe SDK, or server endpoint in this static site. Configure payment, tax, receipt, and other checkout options in Stripe when creating each Payment Link.

## Setup and Next Steps

1. In Stripe, create or confirm one-time USD prices of $60 for one lesson and $200 for the four-lesson package.
2. Create a Payment Link for each product. Test in Stripe test mode first, then create/copy the corresponding live Payment Links.
3. Set `single` and `package` in `coaching-checkout-config.js` to the public `buy.stripe.com` URLs. Do not put API keys or secrets in this client-side file.
4. Publish the site and confirm each button opens the intended Stripe checkout with the correct product and total.
5. After payment, customers must email the coach to arrange lesson times. The site does not automatically schedule lessons or track fulfillment.

For test-mode checkout, use the test Payment Link and a Stripe test card such as `4242 4242 4242 4242` with any future expiry date and any CVC. Test links do not take real payments; do not use test card numbers with live links.

## Project Structure and Flow

- `coaching-checkout-config.js` stores the two public Payment Link URLs.
- `coaching-checkout.js` validates HTTPS Stripe Payment Link URLs and enables each corresponding button.
- `coaching-lessons.html` displays the $60 single lesson and $200 package.
- `STRIPE_INTEGRATION_TODO.md` tracks the remaining setup; no backend files or environment variables are required for this integration.

Resources: [Stripe Support](https://support.stripe.com) · [Stripe documentation](https://docs.stripe.com/mcp)
