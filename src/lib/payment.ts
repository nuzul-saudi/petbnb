// Payment provider interface.
//
// MVP uses MockPaymentProvider which charges nothing and always succeeds.
// Pre-launch swap: implement MoyasarProvider or HyperPayProvider (mada,
// STC Pay, Apple Pay). See CLAUDE.md Section 11.

export type PaymentRequest = {
  bookingId: string;
  amountSAR: number;
  description: string;
};

export type PaymentResult =
  | { status: 'authorized'; reference: string }
  | { status: 'declined'; reason: string };

export interface PaymentProvider {
  authorize(request: PaymentRequest): Promise<PaymentResult>;
}

export const MockPaymentProvider: PaymentProvider = {
  async authorize(request) {
    // Simulate network latency so the UI's "processing" state is visible.
    await new Promise((r) => setTimeout(r, 600));
    return {
      status: 'authorized',
      reference: `mock_${request.bookingId}_${Date.now()}`,
    };
  },
};
