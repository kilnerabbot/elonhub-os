import { lineNetCents, toRand } from "./money.ts";

/**
 * Mapping quote lines onto invoice lines.
 *
 * quote_items carries discount_pct; invoice_items does not. Something has to
 * absorb the discount, and the choice matters:
 *
 *   - Divide the discounted net back into a per-unit price and the cents no
 *     longer divide evenly, so the invoice total drifts from the quote total.
 *     A client who compares the two documents finds the difference.
 *   - Keep the original quantity at its full unit price and the discount is
 *     simply lost. The invoice overcharges.
 *
 * So a discounted line becomes a single unit priced at its exact net, with the
 * original quantity and discount spelled out in the description. The document
 * still reads clearly and the totals reconcile to the cent.
 *
 * Undiscounted lines — the common case — copy across untouched and keep their
 * real quantity and unit price.
 */

export type QuoteItemRow = {
  description: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  is_vatable: boolean;
  sort_order: number;
};

export type InvoiceItemRow = {
  description: string;
  quantity: number;
  unit_price: number;
  is_vatable: boolean;
  sort_order: number;
};

export function toInvoiceLines(items: QuoteItemRow[]): InvoiceItemRow[] {
  return items.map((item) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unit_price);
    const discount = Number(item.discount_pct);

    if (discount <= 0) {
      return {
        description: item.description,
        quantity,
        unit_price: unitPrice,
        is_vatable: item.is_vatable,
        sort_order: item.sort_order,
      };
    }

    const net = toRand(
      lineNetCents({
        quantity,
        unit_price: unitPrice,
        discount_pct: discount,
        is_vatable: item.is_vatable,
      })
    );

    return {
      description: `${item.description} (${quantity} × ${unitPrice.toFixed(2)}, less ${discount}%)`,
      quantity: 1,
      unit_price: net,
      is_vatable: item.is_vatable,
      sort_order: item.sort_order,
    };
  });
}
