---
title: How billing works
---
# How billing works

1. A customer picks a **plan** or a **pay-as-you-go bundle** and pays through Stripe.
2. Stripe confirms the payment and sends us a signed event.
3. Our server verifies the signature and **credits the account** — subscription checks (which reset each cycle) or permanent pay-as-you-go checks.
4. Spending burns subscription checks first, then pay-as-you-go.

Renewals automatically refill the monthly check quota. Cancelling keeps any pay-as-you-go balance but ends the subscription checks.

The whole ladder is managed in **Admin → God View → Plans** and mirrored into Stripe by the **Publish** button — Check's config is always the source of truth.