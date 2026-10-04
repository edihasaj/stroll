import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronDown, ChevronUp, Circle, CircleCheck, Clock } from "lucide-react-native";
import { useCompactTimeAgo } from "@/hooks/use-compact-time-ago";
import type { Theme } from "@/styles/theme";
import type { TodoEntry } from "@/types/stream";

/**
 * The card floats inside `ComposerTrackBar`, an absolutely-positioned overlay whose clearance
 * above the transcript is a fixed estimate (`resolveComposerTrackTailClearance`), not a measured
 * one. An unbounded row list would grow past that budget and cover transcript content, so the
 * list scrolls internally past a handful of rows — the same reasoning as the queue track's cap.
 */
const TASK_ROW_HEIGHT = 28;
const TASK_ROWS_VISIBLE = 5;
const TASK_ROWS_MAX_HEIGHT = TASK_ROW_HEIGHT * TASK_ROWS_VISIBLE;

export const AgentTaskList = memo(function AgentTaskList({
  tasks,
}: {
  tasks: TodoEntry[] | undefined;
}) {
  if (!tasks?.length) return null;
  return <TaskListCard tasks={tasks} />;
});

type TaskState = "pending" | "in_progress" | "completed";

function resolveTaskState(task: TodoEntry): TaskState {
  if (task.completed || task.status === "completed") return "completed";
  if (task.status === "in_progress") return "in_progress";
  return "pending";
}

const TaskListCard = memo(function TaskListCard({ tasks }: { tasks: TodoEntry[] }) {
  const { t } = useTranslation();
  // Starts collapsed — the header alone matches the fixed clearance the transcript already
  // reserves for a single-row pill. Expanding is the user's call, not the default footprint.
  const [collapsed, setCollapsed] = useState(true);
  const handleToggle = useCallback(() => setCollapsed((current) => !current), []);
  const accessibilityState = useMemo(() => ({ expanded: !collapsed }), [collapsed]);

  // Client-only "last changed" stamp: the store only hands out a new `tasks`
  // reference when the list actually changes, so this needs no server timestamp.
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => new Date());
  const tasksRef = useRef(tasks);
  useEffect(() => {
    if (tasksRef.current === tasks) return;
    tasksRef.current = tasks;
    setLastUpdatedAt(new Date());
  }, [tasks]);

  const completed = useMemo(
    () => tasks.filter((task) => resolveTaskState(task) === "completed").length,
    [tasks],
  );

  const timeLabel = useCompactTimeAgo(lastUpdatedAt);
  const updatedText =
    timeLabel === "now"
      ? t("composer.taskProgress.updatedJustNow")
      : t("composer.taskProgress.updatedAgo", { time: timeLabel });
  const summaryText = t("composer.taskProgress.summary", {
    updated: updatedText,
    completed,
    total: tasks.length,
  });

  return (
    <View style={styles.card} testID="agent-task-list-header">
      <Pressable
        onPress={handleToggle}
        style={styles.header}
        accessibilityRole="button"
        accessibilityLabel={
          collapsed ? t("composer.taskProgress.expand") : t("composer.taskProgress.collapse")
        }
        accessibilityState={accessibilityState}
      >
        <Text style={styles.title} numberOfLines={1}>
          {t("composer.taskProgress.title")}
        </Text>
        <View style={styles.headerTrailing}>
          <Text style={styles.summary} numberOfLines={1}>
            {summaryText}
          </Text>
          {collapsed ? (
            <ThemedChevronDown size={14} uniProps={iconForegroundMutedMapping} />
          ) : (
            <ThemedChevronUp size={14} uniProps={iconForegroundMutedMapping} />
          )}
        </View>
      </Pressable>
      {collapsed ? null : (
        <ScrollView style={styles.rows} contentContainerStyle={styles.rowsContent}>
          {tasks.map((task, index) => (
            <TaskProgressRow key={task.id ?? `${index}:${task.text}`} task={task} />
          ))}
        </ScrollView>
      )}
    </View>
  );
});

function TaskProgressRow({ task }: { task: TodoEntry }) {
  const state = resolveTaskState(task);
  const text = state === "in_progress" && task.activeForm ? task.activeForm : task.text;
  return (
    <View style={styles.row}>
      <TaskStateGlyph state={state} />
      <Text
        style={[styles.rowText, state === "in_progress" && styles.rowTextActive]}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

function TaskStateGlyph({ state }: { state: TaskState }) {
  if (state === "completed") {
    return <ThemedCircleCheck size={14} uniProps={iconForegroundExtraMutedMapping} />;
  }
  if (state === "in_progress") {
    return <ThemedClock size={14} uniProps={iconForegroundMapping} />;
  }
  return <ThemedCircle size={14} uniProps={iconForegroundExtraMutedMapping} />;
}

const styles = StyleSheet.create((theme) => ({
  // `width: 100%` forces `ComposerTrackBar`'s track row to wrap the rest of that row's pills
  // (subagents, diff stat, plugin pills) onto the line below, so the card reads as its own row
  // directly above the composer rather than squeezed between them.
  // Same card finish as settings (docs/design.md "Finish"): light lifts with a
  // soft shadow on a brighter fill, dark lifts with an inset highlight on its own
  // surface step. Both keep the hairline border underneath the elevation.
  card: {
    width: "100%",
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colorScheme === "dark" ? theme.colors.surface1 : theme.colors.surface0,
    boxShadow: theme.colorScheme === "dark" ? theme.shadow.insetHighlight : theme.shadow.xs,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    minHeight: 36,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  title: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  headerTrailing: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  summary: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    ...theme.tabularNums,
  },
  rows: {
    maxHeight: TASK_ROWS_MAX_HEIGHT,
    borderTopWidth: theme.borderWidth[1],
    // In-card divider, not the card's own outer hairline — docs/design.md "Finish".
    borderTopColor: theme.colors.borderDivider,
  },
  rowsContent: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: 28,
  },
  rowText: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  rowTextActive: {
    color: theme.colors.foreground,
  },
}));

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronUp = withUnistyles(ChevronUp);
const ThemedCircle = withUnistyles(Circle);
const ThemedCircleCheck = withUnistyles(CircleCheck);
const ThemedClock = withUnistyles(Clock);
const iconForegroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const iconForegroundMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const iconForegroundExtraMutedMapping = (theme: Theme) => ({
  color: theme.colors.foregroundExtraMuted,
});
