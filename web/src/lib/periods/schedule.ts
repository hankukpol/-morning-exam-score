import { addDays } from "date-fns";
import { ExamType, Subject } from "@/generated/prisma";

type SessionSeed = {
  examType: ExamType;
  week: number;
  subject: Subject;
  examDate: Date;
};

const weekdayTemplates = [
  { offset: 0, subject: Subject.POLICE_SCIENCE, examType: "ALL" as const },
  { offset: 1, subject: Subject.CONSTITUTIONAL_LAW, examType: ExamType.GONGCHAE },
  { offset: 1, subject: Subject.CRIMINOLOGY, examType: ExamType.GYEONGCHAE },
  { offset: 2, subject: Subject.CRIMINAL_PROCEDURE, examType: "ALL" as const },
  { offset: 3, subject: Subject.CUMULATIVE, examType: "ALL" as const },
  { offset: 4, subject: Subject.CRIMINAL_LAW, examType: "ALL" as const },
];

function shouldCreateCriminology(examDate: Date) {
  return examDate.getMonth() + 1 >= 3;
}

export function buildPeriodSessions(input: {
  startDate: Date;
  endDate: Date;
  totalWeeks: number;
}) {
  const sessions: SessionSeed[] = [];

  for (let week = 1; week <= input.totalWeeks; week += 1) {
    const weekStart = addDays(input.startDate, (week - 1) * 7);

    for (const template of weekdayTemplates) {
      const examDate = addDays(weekStart, template.offset);

      if (examDate > input.endDate) {
        continue;
      }

      if (
        template.subject === Subject.CRIMINOLOGY &&
        !shouldCreateCriminology(examDate)
      ) {
        continue;
      }

      if (template.examType === "ALL") {
        sessions.push({
          examType: ExamType.GONGCHAE,
          week,
          subject: template.subject,
          examDate,
        });
        sessions.push({
          examType: ExamType.GYEONGCHAE,
          week,
          subject: template.subject,
          examDate,
        });
        continue;
      }

      sessions.push({
        examType: template.examType,
        week,
        subject: template.subject,
        examDate,
      });
    }
  }

  return sessions;
}
