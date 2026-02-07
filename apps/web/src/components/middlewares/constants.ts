export const hookColors: Record<string, string> = {
  onRequest: "border-blue-300 text-blue-700 bg-blue-50",
  onResponse: "border-green-300 text-green-700 bg-green-50",
  onHttpRequest: "border-purple-300 text-purple-700 bg-purple-50",
  onHttpResponse: "border-orange-300 text-orange-700 bg-orange-50",
};

export const hookDescriptions: Record<string, string> = {
  onRequest: "Intercepts WebSocket messages from client to bot",
  onResponse: "Intercepts WebSocket messages from bot to client",
  onHttpRequest: "Intercepts HTTP requests from client to bot",
  onHttpResponse: "Intercepts HTTP responses from bot to client",
};
