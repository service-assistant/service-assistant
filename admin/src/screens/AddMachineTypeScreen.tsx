import Constants from "expo-constants";
import { apiUrl } from "../config/api";
import { router } from "expo-router";
import { ArrowLeft, Plus } from "lucide-react-native";
import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminSidebar } from "../components/AdminSidebar";

const DEVICE_TYPES_URL = apiUrl("api/device_types");
const WEB_DEVICE_TYPES_URL = "/api/device_types";
const AUTH_TOKEN =
  ((Constants.expoConfig?.extra as { authToken?: string } | undefined)?.authToken) ??
  process.env.AUTH_TOKEN ??
  process.env.EXPO_PUBLIC_AUTH_TOKEN ??
  "";

type CreatedDeviceType = {
  id: number;
  name: string;
};

const contentContainerStyle =
  Platform.OS === "web"
    ? ({
        alignItems: "center",
        paddingBottom: 48,
        paddingLeft: 34,
        paddingRight: 34,
        paddingTop: 64
      } as unknown as ViewStyle)
    : undefined;

const contentShellStyle =
  Platform.OS === "web"
    ? ({
        maxWidth: 760,
        width: "100%"
      } as unknown as ViewStyle)
    : undefined;

function getApiHeaders() {
  return Platform.OS === "web" ? undefined : { Authorization: `Bearer ${AUTH_TOKEN}` };
}

async function createDeviceType(payload: { name: string }) {
  const response = await fetch(Platform.OS === "web" ? WEB_DEVICE_TYPES_URL : DEVICE_TYPES_URL, {
    method: "POST",
    headers: {
      ...getApiHeaders(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = ((await response.json()) as { detail?: string }).detail;
    } catch {}
    throw new Error(detail ?? `Nie udało się dodać typu maszyny (${response.status}).`);
  }

  return (await response.json()) as CreatedDeviceType;
}

export function AddMachineTypeScreen() {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  async function submitMachineType() {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setSubmitError("Nazwa typu nie może być pusta.");
      return;
    }

    setSaving(true);
    setSubmitError(undefined);

    try {
      await createDeviceType({ name: trimmedName });
      router.replace("/catalog?tab=machineTypes");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Nie udało się dodać typu maszyny.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-[#0D141C]" edges={["top", "left", "right"]}>
      <View className="flex-1 flex-row bg-[#0D141C]">
        <AdminSidebar activeSection="catalog" />

        <ScrollView className="min-w-0 flex-1" contentContainerClassName={Platform.OS === "web" ? undefined : "px-[34px] pb-12 pt-[37px]"} contentContainerStyle={contentContainerStyle}>
          <View className="w-full" style={contentShellStyle}>
            <Pressable className="mb-5 h-9 self-start flex-row items-center justify-center rounded-lg border border-[rgba(148,163,184,0.18)] bg-transparent px-3 hover:border-[rgba(255,122,0,0.35)] hover:bg-[rgba(255,255,255,0.04)]" onPress={() => router.replace("/catalog?tab=machineTypes")}>
              <ArrowLeft size={17} color="#AAB4C0" strokeWidth={2.5} />
              <Text className="ml-2 text-[13px] font-bold text-[#AAB4C0]">Wróć do typów</Text>
            </Pressable>

            <Text className="text-[40px] font-black leading-[48px] text-[#E8EAED]">Dodaj typ maszyny</Text>
            <Text className="mt-2 max-w-[640px] text-[15px] font-semibold leading-[22px] text-[#9AA4B2]">
              Utwórz kategorię używaną przy grupowaniu modeli i filtrowaniu dokumentów.
            </Text>

            <View className="mt-7 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#151D27] p-5">
              <Text className="mb-2 text-[11px] font-black uppercase tracking-[0.6px] text-[#9AA4B2]">Nazwa typu</Text>
              <TextInput
                className="h-11 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#0F1720] px-3 text-[15px] font-semibold text-[#E8EAED] outline-none"
                onChangeText={setName}
                placeholder="np. Paletowy z masztem"
                placeholderTextColor="#6F7A88"
                value={name}
              />
              {submitError ? <Text className="mt-4 text-[13px] font-bold text-[#ffaaa8]">{submitError}</Text> : null}

              <View className="mt-5 flex-row justify-end gap-3">
                <Pressable className="h-11 justify-center rounded-md border border-[#2d3745] px-5 hover:bg-[#222b36]" disabled={saving} onPress={() => router.replace("/catalog?tab=machineTypes")}>
                  <Text className="text-[13px] font-black text-[#dbe3ee]">Anuluj</Text>
                </Pressable>
                <Pressable className={`h-11 flex-row items-center justify-center rounded-md px-5 ${saving ? "bg-[#7a4d24]" : "bg-[#FF7A00] hover:bg-[#FF921F]"}`} disabled={saving} onPress={submitMachineType}>
                  <Plus size={18} color="#111820" strokeWidth={2.4} />
                  <Text className="ml-2 text-[13px] font-black text-[#111820]">{saving ? "Dodawanie..." : "Dodaj typ"}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
