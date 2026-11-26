import type {
  CourseModule,
  LearningProfileInput,
  SchedulePlan,
  StudySession,
} from "@/types/vidmind";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function addDaysISO(baseDate: Date, offsetDays: number): string {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = (hhmm || "19:00").split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 19 * 60;
  return h * 60 + m;
}

function formatClock(totalMinutes: number): string {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * Deterministic scheduling engine: computes feasibility, builds realistic
 * day-wise study blocks with breaks/practice/notes, and handles missed-day recovery.
 */
export function buildAdaptiveStudySchedule(
  modules: CourseModule[],
  profile: LearningProfileInput,
  completedLessonIds: Set<string> = new Set(),
  startDate = new Date()
): SchedulePlan {
  const speedMultiplier =
    profile.learningSpeed === "slow"
      ? 1.25
      : profile.learningSpeed === "fast"
        ? 0.85
        : 1.0;

  const modeMultiplier =
    profile.schedulingMode === "intensive"
      ? 1.15
      : profile.schedulingMode === "relaxed"
        ? 0.85
        : 1.0;

  const remainingLessons = modules.flatMap((mod) =>
    mod.lessons
      .filter((les) => !completedLessonIds.has(les.id) && !les.completed)
      .map((les) => {
        const viewMins = Math.max(10, Math.round(les.estimatedMinutes * speedMultiplier));
        const practiceMins = Math.max(5, Math.round(viewMins * 0.35));
        const notesMins = Math.max(5, Math.round(viewMins * 0.25));
        return {
          moduleTitle: mod.title,
          lesson: les,
          viewMins,
          practiceMins,
          notesMins,
          totalMins: viewMins + practiceMins + notesMins,
        };
      })
  );

  const totalRequiredMinutes = remainingLessons.reduce((acc, item) => acc + item.totalMins, 0);

  // Count active study days within deadline respecting daysOff
  const daysOffSet = new Set((profile.daysOff || []).map((d) => d.slice(0, 3)));
  const activeDates: Array<{ dayOffset: number; dateISO: string }> = [];
  for (let d = 0; d < Math.max(1, profile.deadlineDays); d++) {
    const dt = new Date(startDate);
    dt.setDate(dt.getDate() + d);
    const weekday = WEEKDAYS[dt.getDay()];
    if (!daysOffSet.has(weekday)) {
      activeDates.push({ dayOffset: d, dateISO: dt.toISOString().slice(0, 10) });
    }
  }

  const effectiveDailyMinutes = Math.max(
    15,
    Math.round(profile.dailyMinutes * modeMultiplier)
  );
  const totalAvailableMinutes = activeDates.length * effectiveDailyMinutes;
  const feasible = totalAvailableMinutes >= totalRequiredMinutes;

  const recommendedDailyMinutes = activeDates.length
    ? Math.ceil(totalRequiredMinutes / activeDates.length)
    : totalRequiredMinutes;
  const recommendedDays = Math.max(
    1,
    Math.ceil(totalRequiredMinutes / Math.max(15, effectiveDailyMinutes))
  );

  const feasibilityMessage = feasible
    ? `Plan is realistic: ${totalRequiredMinutes} study mins fit within ${totalAvailableMinutes} available mins across ${activeDates.length} active days.`
    : `Deadline is tight: requires ${totalRequiredMinutes} mins, but your current schedule provides ${totalAvailableMinutes} mins. Recommended: ${recommendedDailyMinutes} mins/day or extend deadline to ${recommendedDays} study days.`;

  // Allocate sessions chronologically across active days (never packing beyond daily cap)
  const sessions: StudySession[] = [];
  const startClockBase = parseTimeToMinutes(profile.preferredTime);

  let dayCursor = 0;
  let usedOnDay = 0;

  for (const item of remainingLessons) {
    if (dayCursor >= activeDates.length) {
      // Extend past original deadline honestly so the completion date reflects reality
      let extraOffset = (activeDates[activeDates.length - 1]?.dayOffset ?? 0) + 1;
      while (activeDates.length <= dayCursor) {
        const dt = new Date(startDate);
        dt.setDate(dt.getDate() + extraOffset);
        if (!daysOffSet.has(WEEKDAYS[dt.getDay()])) {
          activeDates.push({ dayOffset: extraOffset, dateISO: dt.toISOString().slice(0, 10) });
        }
        extraOffset++;
      }
    }

    if (usedOnDay > 0 && usedOnDay + item.totalMins > effectiveDailyMinutes) {
      dayCursor++;
      usedOnDay = 0;
      while (dayCursor >= activeDates.length) {
        let extraOffset = (activeDates[activeDates.length - 1]?.dayOffset ?? 0) + 1;
        const dt = new Date(startDate);
        dt.setDate(dt.getDate() + extraOffset);
        if (!daysOffSet.has(WEEKDAYS[dt.getDay()])) {
          activeDates.push({ dayOffset: extraOffset, dateISO: dt.toISOString().slice(0, 10) });
        }
        extraOffset++;
      }
    }

    const activeDay = activeDates[dayCursor];
    const startClock = startClockBase + usedOnDay;
    const endClock = startClock + item.totalMins;
    const breakMins = usedOnDay > 0 ? profile.breakMinutes : 0;

    sessions.push({
      id: `sess-${sessions.length + 1}`,
      dayNumber: dayCursor + 1,
      dateISO: activeDay.dateISO,
      startTime: formatClock(startClock),
      endTime: formatClock(endClock),
      moduleTitle: item.moduleTitle,
      lessonId: item.lesson.id,
      lessonTitle: item.lesson.title,
      videoStartTimestamp: item.lesson.startTimestamp,
      videoEndTimestamp: item.lesson.endTimestamp,
      viewingMinutes: item.viewMins,
      practiceMinutes: item.practiceMins,
      notesMinutes: item.notesMins,
      breakMinutes: breakMins,
      status: "scheduled",
    });

    usedOnDay += item.totalMins + profile.breakMinutes;
  }

  const estimatedCompletionDate =
    sessions.length > 0
      ? sessions[sessions.length - 1].dateISO
      : addDaysISO(startDate, 0);

  const keyTopics = modules
    .flatMap((m) => m.lessons.flatMap((l) => l.keyConcepts))
    .slice(0, 6);

  const spacedRevisions = [1, 3, 7, 14].map((offset, idx) => ({
    revisionLabel: `Revision ${idx + 1} (Day +${offset})`,
    dayOffset: offset,
    dateISO: addDaysISO(startDate, offset),
    focusTopics: keyTopics.length ? keyTopics : ["Core Module Review"],
  }));

  return {
    feasible,
    feasibilityMessage,
    recommendedDays,
    recommendedDailyMinutes,
    totalRequiredMinutes,
    totalAvailableMinutes,
    estimatedCompletionDate,
    sessions,
    spacedRevisions,
  };
}
