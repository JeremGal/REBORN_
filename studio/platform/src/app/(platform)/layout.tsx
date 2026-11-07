import { TopBar } from "@/components/TopBar";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-[1440px] px-5 pt-6 pb-16">{children}</main>
    </>
  );
}
