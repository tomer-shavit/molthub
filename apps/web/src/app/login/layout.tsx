export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth pages get a clean layout with no sidebar or navigation
  return <>{children}</>;
}
