/**
 * PAID REGISTRATIONS — plug Razorpay (or any gateway) in here.
 *
 * <RegistrationPanel> calls this only when a hackathon's price is greater than 0.
 * Free events never reach this function.
 *
 * Replace the placeholder below with a real gateway flow and keep the contract:
 *   - resolve with { status: 'paid' } once the money is captured, and the
 *     registration is then saved with paid = true
 *   - resolve with any other status ({ status: 'pending' } / { status: 'failed' })
 *     and the seat is NOT reserved
 *   - throw for an unexpected error so the panel can show the message
 *
 * Razorpay sketch (server-side order creation + checkout, then verify the
 * signature on the server before returning 'paid'):
 *
 *   const { orderId, amount } = await fetch('/api/razorpay/order', { … });
 *   const result = await window.Razorpay({ key, order_id: orderId, … });
 *   await fetch('/api/razorpay/verify', { … });
 *   return { status: 'paid', paymentId: result.razorpay_payment_id };
 *
 * The gateway key must never live in a VITE_ variable: create the order and
 * verify the signature on the server (see scripts/api-server.mjs).
 */
export async function startRegistrationPayment(hackathonId) {
  // TODO: replace with the Razorpay checkout call described above.
  return { status: "paid" };
}
