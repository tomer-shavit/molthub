import { MessageCircle, Send, Gamepad2, Hash, MessageSquare } from "lucide-react";

export const channelIcons: Record<string, React.ElementType> = {
  whatsapp: MessageCircle,
  telegram: Send,
  discord: Gamepad2,
  slack: Hash,
};

export const categoryColors: Record<string, string> = {
  communication: "border-blue-300 text-blue-700 bg-blue-50",
  development: "border-purple-300 text-purple-700 bg-purple-50",
  operations: "border-orange-300 text-orange-700 bg-orange-50",
  minimal: "border-gray-300 text-gray-700 bg-gray-50",
};

export function getChannelIcon(type: string) {
  return channelIcons[type.toLowerCase()] ?? MessageSquare;
}
