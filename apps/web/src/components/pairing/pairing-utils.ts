/**
 * Shared utility functions for pairing UI components.
 */

export function maskSenderId(senderId: string): string {
  if (senderId.length <= 4) return senderId;
  return "****" + senderId.slice(-4);
}

export function channelBadgeColor(channelType: string): string {
  switch (channelType.toLowerCase()) {
    case "whatsapp":
      return "bg-green-100 text-green-800 border-green-200";
    case "telegram":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "discord":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "slack":
      return "bg-pink-100 text-pink-800 border-pink-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}
