import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Search } from "lucide-react-native";
import { colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { FALLBACK_HELP_FAQ, helpApi, type HelpFaqItem } from "@/lib/api/help";

export default function HelpScreen(): React.ReactElement {
  const faq = useQuery({
    queryKey: ["help-faq"],
    queryFn: helpApi.faq,
    staleTime: 1000 * 60 * 30,
    placeholderData: FALLBACK_HELP_FAQ,
  });

  const data = faq.data ?? FALLBACK_HELP_FAQ;
  const [query, setQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    data.categories[0]?.id ?? "",
  );
  const [openItemId, setOpenItemId] = useState<string | null>(
    data.items.find((item) => item.startHere)?.id ?? data.items[0]?.id ?? null,
  );

  const selectedCategory = data.categories.some((item) => item.id === selectedCategoryId)
    ? selectedCategoryId
    : data.categories[0]?.id ?? "";

  const visibleItems = useMemo(() => {
    const search = query.trim().toLowerCase();

    return data.items.filter((item) => {
      const inCategory = !selectedCategory || item.categoryId === selectedCategory;
      const matchesSearch =
        !search ||
        item.question.toLowerCase().includes(search) ||
        item.answer.toLowerCase().includes(search);

      return inCategory && matchesSearch;
    });
  }, [data.items, query, selectedCategory]);

  return (
    <ScrollScreen
      padding={screenPadding.detail}
      contentStyle={styles.content}
      bottomSpace={22}
      footer={<SupportCard />}
      testID="profile-help"
    >
      <BackHeader title="Help & FAQ" onBack={() => router.back()} padding={0} />

      <View style={styles.searchBox}>
        <Search size={16} color={colors.t4} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search help"
          placeholderTextColor={colors.t4}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.searchInput}
          accessibilityLabel="Search help"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryList}
        style={styles.categoryScroll}
      >
        {data.categories.map((category) => {
          const selected = category.id === selectedCategory;
          return (
            <Pressable
              key={category.id}
              onPress={() => {
                setSelectedCategoryId(category.id);
                const first = data.items.find((item) => item.categoryId === category.id);
                setOpenItemId(first?.id ?? null);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.categoryChip,
                selected ? styles.categoryChipSelected : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text
                variant="chipSm"
                color={selected ? colors.onAcc : colors.t2}
                numberOfLines={1}
              >
                {category.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text variant="eyebrow" color={colors.t3} style={styles.sectionTitle}>
        START HERE
      </Text>

      <View style={styles.faqList}>
        {visibleItems.length > 0 ? (
          visibleItems.map((item) => (
            <FaqCard
              key={item.id}
              item={item}
              open={item.id === openItemId}
              onToggle={() => setOpenItemId(item.id === openItemId ? null : item.id)}
            />
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text variant="labelLg" color={colors.t0}>
              No results found
            </Text>
            <Text variant="bodySm" color={colors.t2} style={styles.emptyText}>
              Try another search or choose a different topic.
            </Text>
          </View>
        )}
      </View>

    </ScrollScreen>
  );
}

function SupportCard(): React.ReactElement {
  return (
    <View style={styles.supportCard}>
      <View style={styles.supportCopy}>
        <Text variant="labelLg" color={colors.t0}>
          Still stuck?
        </Text>
        <Text variant="bodySm" color={colors.t2} style={styles.supportText}>
          A person answers, usually within a day.
        </Text>
      </View>
      <Button
        label="Contact us"
        variant="primary"
        block={false}
        height={42}
        onPress={() => router.push("/profile/contact")}
        style={styles.supportButton}
        testID="help-contact"
      />
    </View>
  );
}

function FaqCard({
  item,
  open,
  onToggle,
}: {
  item: HelpFaqItem;
  open: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <View style={styles.faqCard}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={item.question}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.faqHeader, pressed ? styles.pressed : null]}
      >
        <Text variant="labelLg" color={colors.t0} style={styles.questionText}>
          {item.question}
        </Text>
        <ChevronDown
          size={16}
          color={colors.t3}
          style={open ? styles.chevronOpen : undefined}
        />
      </Pressable>
      {open ? (
        <Text variant="bodySm" color={colors.t2} style={styles.answerText}>
          {item.answer}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 12,
  },
  searchBox: {
    minHeight: 44,
    marginTop: 14,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.s1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 0,
    color: colors.t0,
    fontSize: 15,
    lineHeight: 20,
  },
  categoryScroll: {
    marginHorizontal: -screenPadding.detail,
    marginTop: 12,
  },
  categoryList: {
    paddingHorizontal: screenPadding.detail,
    gap: 8,
  },
  categoryChip: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.s1,
  },
  categoryChipSelected: {
    backgroundColor: colors.acc,
  },
  sectionTitle: {
    marginTop: 18,
    marginBottom: 10,
  },
  faqList: {
    gap: 10,
  },
  faqCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.s3,
    overflow: "hidden",
  },
  faqHeader: {
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  questionText: {
    flex: 1,
    lineHeight: 20,
  },
  answerText: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    marginTop: -2,
    lineHeight: 21,
  },
  chevronOpen: {
    transform: [{ rotate: "180deg" }],
  },
  emptyCard: {
    padding: 16,
    borderRadius: radius.xl,
    backgroundColor: colors.s3,
  },
  emptyText: {
    marginTop: 6,
    lineHeight: 20,
  },
  supportCard: {
    padding: 14,
    minHeight: 78,
    borderRadius: radius.xl,
    backgroundColor: colors.s4,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  supportCopy: {
    flex: 1,
  },
  supportText: {
    marginTop: 4,
    lineHeight: 18,
  },
  supportButton: {
    minWidth: 96,
    paddingHorizontal: 16,
  },
  pressed: {
    opacity: 0.82,
  },
});
