import SettingsShell from "@/components/admin/SettingsShell";

export const metadata = {
  title: {
    absolute: "Settings | Admin",
  },
};

export default function SettingsLayout({ children }) {
  return <SettingsShell>{children}</SettingsShell>;
}
