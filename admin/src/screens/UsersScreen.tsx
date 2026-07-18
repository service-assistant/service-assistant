import { Calendar, ChevronDown, Clock3, History, MessageSquare } from "lucide-react-native";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminSidebar } from "../components/AdminSidebar";

type ServiceUser = {
  id: number;
  name: string;
  role: string;
  timeLabel: string;
  status: "online" | "offline";
  active?: boolean;
  avatarUrl?: string;
  initials: string;
};

const users: ServiceUser[] = [
  {
    id: 1,
    name: "Jan Kowalski",
    role: "SERWISANT SENIOR",
    timeLabel: "2 minuty temu",
    status: "online",
    active: true,
    initials: "JK",
    avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=96&q=80"
  },
  {
    id: 2,
    name: "Anna Nowak",
    role: "KOORDYNATOR",
    timeLabel: "15.10.2023 14:20",
    status: "offline",
    initials: "AN"
  },
  {
    id: 3,
    name: "Piotr Wiśniewski",
    role: "SERWISANT",
    timeLabel: "14.10.2023 09:15",
    status: "offline",
    initials: "PW",
    avatarUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=96&q=80"
  }
];

function UserAvatar({ user }: { user: ServiceUser }) {
  return (
    <View className="relative h-[48px] w-[48px] items-center justify-center rounded-full bg-[#303944]">
      {user.avatarUrl ? (
        <Image source={{ uri: user.avatarUrl }} className="h-full w-full rounded-full" resizeMode="cover" />
      ) : (
        <Text className="text-[16px] font-black text-[#E8EAED]">{user.initials}</Text>
      )}
      <View
        className={`absolute bottom-[2px] right-[1px] h-[10px] w-[10px] rounded-full border-2 border-[#1A1D23] ${
          user.status === "online" ? "bg-[#25d366]" : "bg-[#4B5563]"
        }`}
      />
    </View>
  );
}

function UserRow({ user }: { user: ServiceUser }) {
  const online = user.status === "online";

  return (
    <View
      className={`relative min-h-[100px] flex-row items-center rounded-[10px] border bg-[#1A1D23] px-7 py-5 ${
        user.active ? "border-transparent" : "border-[#2A2F38]"
      }`}
    >
      {user.active ? <View className="absolute bottom-0 left-0 top-0 w-[3px] rounded-l-[10px] bg-[#FF8A00]" /> : null}

      <UserAvatar user={user} />

      <View className="ml-5 min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[20px] font-black text-[#E8EAED]">{user.name}</Text>
        <View className="mt-2 flex-row items-center">
          <View className="rounded bg-[#3A404A] px-2 py-[2px]">
            <Text className="text-[10px] font-black text-[#FFD6A8]">{user.role}</Text>
          </View>
          <View className="ml-3 flex-row items-center">
            {online ? <Clock3 size={14} color="#B69A7D" strokeWidth={2.5} /> : <Calendar size={14} color="#B69A7D" strokeWidth={2.5} />}
            <Text className="ml-2 text-[14px] font-semibold text-[#B69A7D]">{user.timeLabel}</Text>
          </View>
        </View>
      </View>

      <Pressable
        className={`h-[43px] flex-row items-center justify-center rounded-md px-4 ${
          online ? "bg-[#FF8A00] shadow-lg hover:bg-[#FF981F]" : "border border-[#3A414D] hover:bg-[#222832]"
        }`}
      >
        {online ? <MessageSquare size={16} color="#111820" strokeWidth={2.8} /> : <History size={16} color="#D7ECFF" strokeWidth={2.7} />}
        <Text className={`ml-2 text-[13px] font-black ${online ? "text-[#111820]" : "text-[#E8EAED]"}`}>
          {online ? "Podgląd czatów" : "Historia rozmów"}
        </Text>
      </Pressable>
    </View>
  );
}

export function UsersScreen() {
  return (
    <SafeAreaView className="flex-1 bg-[#0B1117]" edges={["top", "left", "right"]}>
      <View className="flex-1 flex-row bg-[#0B1117]">
        <AdminSidebar activeSection="users" />

        <ScrollView className="min-w-0 flex-1" contentContainerClassName="px-[21px] pb-12 pt-[22px]">
          <View className="mb-7 flex-row items-center">
            <Text className="text-[25px] font-black text-[#E8EAED]">Aktywność Serwisantów</Text>
            <Pressable className="ml-auto h-[45px] flex-row items-center justify-center rounded-md border border-[#26303B] bg-[#0D1117] px-4 hover:bg-[#141B24]">
              <Text className="text-[13px] font-black text-[#DDEFFF]">Wszyscy (Status)</Text>
              <ChevronDown size={16} color="#9AA4B2" strokeWidth={2.5} className="ml-2" />
            </Pressable>
          </View>

          <View className="gap-4">
            {users.map((user) => (
              <UserRow key={user.id} user={user} />
            ))}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
