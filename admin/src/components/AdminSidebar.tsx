import { router } from "expo-router";
import { BookOpenCheck, Cpu, History, LucideIcon, Settings, ShieldCheck, Wrench } from "lucide-react-native";
import { Image, Pressable, Text, View } from "react-native";

export type AdminSidebarSection = "knowledge" | "catalog" | "history" | "users" | "settings";

type NavItem = {
  key: AdminSidebarSection;
  label: string;
  icon: LucideIcon;
  href?: "/" | "/catalog" | "/users";
};

const navItems: NavItem[] = [
  { key: "knowledge", label: "Baza wiedzy", icon: BookOpenCheck, href: "/" },
  { key: "catalog", label: "Katalog maszyn", icon: Wrench, href: "/catalog" },
  { key: "history", label: "Historia zmian", icon: History },
  { key: "users", label: "Użytkownicy", icon: ShieldCheck, href: "/users" }
];

const settingsItem: NavItem = { key: "settings", label: "Ustawienia", icon: Settings };
const logo = require("../../assets/fixo3-sidebar.png");

export function AdminSidebar({ activeSection }: { activeSection: AdminSidebarSection }) {
  return (
    <View className="hidden h-full w-[230px] shrink-0 border-r border-[rgba(255,255,255,0.08)] bg-[#111821] px-0 py-[18px] lg:flex">
      <View className="mb-[16px] items-start border-b border-[rgba(255,255,255,0.08)] px-5 pb-[14px] pt-0">
        <View className="w-[116px] max-w-full overflow-hidden">
          <Image
            source={logo}
            resizeMode="contain"
            style={{ height: 18, width: 58 }}
          />
        </View>
        <Text className="mt-[6px] text-[9px] font-bold uppercase tracking-[1.4px] text-[#9AA4B2]">
          Panel administracyjny
        </Text>
      </View>

      <View className="gap-1">
        {navItems.map((item) => (
          <NavButton key={item.key} item={item} active={activeSection === item.key} />
        ))}
      </View>

      <View className="mt-auto px-[14px]">
        <View className="mb-5 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#151D27] px-4 py-4">
          <View className="flex-row items-center">
            <View className="mr-2 h-[7px] w-[7px] rounded-full bg-[#27d884]" />
            <Text className="text-[12px] font-black text-[#E8EAED]">Asystent aktywny</Text>
          </View>
          <View className="mt-3 flex-row items-center">
            <Cpu size={14} color="#FF7A00" strokeWidth={2.4} />
            <Text className="ml-2 text-[11px] font-bold text-[#9AA4B2]">Wersja bazy: 2026.06.30</Text>
          </View>
        </View>
      </View>

      <View className="border-t border-[rgba(255,255,255,0.08)] pt-5">
        <NavButton item={settingsItem} active={activeSection === settingsItem.key} />
      </View>
    </View>
  );
}

function NavButton({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const href = item.href;

  return (
    <Pressable
      className={`relative h-[43px] flex-row items-center px-[14px] ${
        active ? "bg-[#1B2633]" : "hover:bg-[#1B2633]"
      }`}
      onPress={href ? () => router.push(href) : active ? () => router.push("/") : undefined}
    >
      {active ? <View className="absolute bottom-[7px] left-0 top-[7px] w-[3px] rounded-r bg-[#FF7A00]" /> : null}
      <View className={`h-[28px] w-[28px] items-center justify-center rounded ${active ? "bg-[rgba(255,122,0,0.12)]" : "bg-transparent"}`}>
        <Icon size={18} color={active ? "#FF921F" : "#9AA4B2"} strokeWidth={2.5} />
      </View>
      <Text className={`ml-3 text-[12px] font-extrabold ${active ? "text-[#FF921F]" : "text-[#9AA4B2]"}`}>
        {item.label}
      </Text>
    </Pressable>
  );
}
