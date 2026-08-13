import { z } from "zod";
export const paymentRequestSchema = z.object({ orderId: z.string(), amountCents: z.int().positive(), tipCents: z.int().nonnegative() });
export type PaymentRequest = z.infer<typeof paymentRequestSchema>;
export interface PaymentProvider { authorize(request: PaymentRequest): Promise<{ providerId: string; status: "authorized" }>; }
export class MockPaymentProvider implements PaymentProvider { async authorize(input: PaymentRequest) { const request = paymentRequestSchema.parse(input); return { providerId: `mock_${request.orderId}_${request.amountCents}`, status: "authorized" as const }; } }
