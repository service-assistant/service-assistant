import Constants from "expo-constants";
import { apiUrl } from "../config/api";
import { router } from "expo-router";
import { ArrowLeft, Building2, Plus } from "lucide-react-native";
import { useState } from "react";
import { Image, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminSidebar } from "../components/AdminSidebar";

const BRANDS_URL = apiUrl("api/brands");
const WEB_BRANDS_URL = "/api/brands";
const AUTH_TOKEN =
  ((Constants.expoConfig?.extra as { authToken?: string } | undefined)?.authToken) ??
  process.env.AUTH_TOKEN ??
  process.env.EXPO_PUBLIC_AUTH_TOKEN ??
  "";

type CreatedBrand = {
  id: number;
  logo_url?: string;
  name: string;
};

function getApiHeaders() {
  return Platform.OS === "web" ? undefined : { Authorization: `Bearer ${AUTH_TOKEN}` };
}

async function createBrand(payload: { logo_url?: string; name: string }) {
  const response = await fetch(Platform.OS === "web" ? WEB_BRANDS_URL : BRANDS_URL, {
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
    throw new Error(detail ?? `Nie udało się dodać marki (${response.status}).`);
  }

  return (await response.json()) as CreatedBrand;
}

export function AddBrandScreen() {
  const [logoUrl, setLogoUrl] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  async function submitBrand() {
    const trimmedName = name.trim();
    const trimmedLogoUrl = logoUrl.trim();

    if (!trimmedName) {
      setSubmitError("Nazwa marki nie może być pusta.");
      return;
    }

    setSaving(true);
    setSubmitError(undefined);

    try {
      await createBrand({
        name: trimmedName,
        ...(trimmedLogoUrl ? { logo_url: trimmedLogoUrl } : {})
      });
      router.replace("/catalog?tab=brands");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Nie udało się dodać marki.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-[#0D141C]" edges={["top", "left", "right"]}>
      <View className="flex-1 flex-row bg-[#0D141C]">
        <AdminSidebar activeSection="catalog" />

        <ScrollView className="min-w-0 flex-1" contentContainerClassName="px-[34px] pb-12 pt-[37px]">
          <Pressable className="mb-5 h-9 self-start flex-row items-center justify-center rounded-lg border border-[rgba(148,163,184,0.18)] bg-transparent px-3 hover:border-[rgba(255,122,0,0.35)] hover:bg-[rgba(255,255,255,0.04)]" onPress={() => router.replace("/catalog?tab=brands")}>
            <ArrowLeft size={17} color="#AAB4C0" strokeWidth={2.5} />
            <Text className="ml-2 text-[13px] font-bold text-[#AAB4C0]">Wróć do marek</Text>
          </Pressable>

          <Text className="text-[44px] font-black leading-[52px] text-[#E8EAED]">Dodaj markę</Text>
          <Text className="mt-1 max-w-[720px] text-[15px] font-semibold leading-[22px] text-[#9AA4B2]">
            Utwórz producenta dostępnego później przy dodawaniu modeli i dokumentów.
          </Text>

          <View className="mt-8 grid grid-cols-[minmax(0,1fr)_360px] gap-6">
            <View className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#151D27] p-5">
              <View className="mb-5 flex-row items-center">
                <Building2 size={20} color="#FF921F" />
                <Text className="ml-3 text-[18px] font-semibold text-[#E8EAED]">Dane marki</Text>
              </View>

              <Text className="mb-2 text-[11px] font-black uppercase tracking-[0.6px] text-[#9AA4B2]">Nazwa marki</Text>
              <TextInput
                className="h-11 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#0F1720] px-3 text-[15px] font-semibold text-[#E8EAED] outline-none"
                onChangeText={setName}
                placeholder="np. Toyota"
                placeholderTextColor="#6F7A88"
                value={name}
              />

              <Text className="mb-2 mt-5 text-[11px] font-black uppercase tracking-[0.6px] text-[#9AA4B2]">URL logo opcjonalnie</Text>
              <TextInput
                className="h-11 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#0F1720] px-3 text-[15px] font-semibold text-[#E8EAED] outline-none"
                onChangeText={setLogoUrl}
                placeholder="https://..."
                placeholderTextColor="#6F7A88"
                value={logoUrl}
              />

              {submitError ? <Text className="mt-4 text-[13px] font-bold text-[#ffaaa8]">{submitError}</Text> : null}

              <View className="mt-7 flex-row justify-end gap-3">
                <Pressable className="h-11 justify-center rounded-md border border-[#2d3745] px-5 hover:bg-[#222b36]" disabled={saving} onPress={() => router.replace("/catalog?tab=brands")}>
                  <Text className="text-[13px] font-black text-[#dbe3ee]">Anuluj</Text>
                </Pressable>
                <Pressable className={`h-11 flex-row items-center justify-center rounded-md px-5 ${saving ? "bg-[#7a4d24]" : "bg-[#FF7A00] hover:bg-[#FF921F]"}`} disabled={saving} onPress={submitBrand}>
                  <Plus size={15} color="#111820" />
                  <Text className="ml-2 text-[13px] font-black text-[#111820]">{saving ? "Dodawanie..." : "Dodaj markę"}</Text>
                </Pressable>
              </View>
            </View>

            <View className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#151D27] p-5">
              <Text className="text-[18px] font-semibold text-[#E8EAED]">Podgląd logo</Text>
              <View className="mt-5 h-[190px] items-center justify-center rounded-md border border-[#2d3745] bg-[#0F1720] p-5">
                {logoUrl.trim() ? (
                  <Image source={{ uri: logoUrl.trim() }} className="h-full w-full" resizeMode="contain" />
                ) : (
                  <View className="h-[64px] w-[64px] items-center justify-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#111a21]">
                    <Text className="text-[26px] font-black text-[#FF921F]">{name.trim().charAt(0).toUpperCase() || "?"}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
