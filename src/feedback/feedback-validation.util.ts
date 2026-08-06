import { BadRequestException } from '@nestjs/common';
import { FeedbackQuestionType } from './enums/feedback.enums';

export interface SubmittedAnswer {
  questionId: string;
  value: unknown;
}

export interface SerializedAnswer {
  questionId: string;
  answerText?: string;
  answerNumber?: number;
  answerBoolean?: boolean;
  answerDate?: Date;
  answerOptions?: string[];
}

export interface AnswerValidationResult {
  answers: SerializedAnswer[];
  ratings: Record<string, number>;
  overallScore: number | null;
  npsScore: number | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (
    typeof value === 'string' &&
    value.trim() !== '' &&
    !Number.isNaN(Number(value))
  ) {
    return Number(value);
  }
  return null;
}

/**
 * Validates the raw submitted answers against the form's questions and
 * returns serialized rows plus denormalized rating metrics.
 */
export function validateAndSerializeAnswers(
  questions: Array<{
    id: string;
    label: string;
    questionType: FeedbackQuestionType;
    required: boolean;
    options?: unknown;
    validation?: unknown;
    key?: string | null;
  }>,
  submitted: SubmittedAnswer[],
): AnswerValidationResult {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const seen = new Set<string>();
  const serialized: SerializedAnswer[] = [];
  const ratings: Record<string, number> = {};

  for (const item of submitted) {
    if (!item || !item.questionId) {
      throw new BadRequestException('Each answer must include a questionId');
    }
    if (seen.has(item.questionId)) {
      throw new BadRequestException(
        `Duplicate answer for question ${item.questionId}`,
      );
    }
    seen.add(item.questionId);

    const question = byId.get(item.questionId);
    if (!question) {
      throw new BadRequestException(`Unknown question id ${item.questionId}`);
    }

    const value = item.value;
    const isEmpty =
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);

    if (isEmpty) {
      if (question.required) {
        throw new BadRequestException(
          `Question "${question.questionType}" is required`,
        );
      }
      serialized.push({ questionId: question.id });
      continue;
    }

    const validation = isRecord(question.validation) ? question.validation : {};
    const options = Array.isArray(question.options) ? question.options : [];

    switch (question.questionType) {
      case FeedbackQuestionType.SHORT_TEXT:
      case FeedbackQuestionType.LONG_TEXT:
        serialized.push({ questionId: question.id, answerText: String(value) });
        break;

      case FeedbackQuestionType.EMAIL: {
        const str = String(value);
        if (!EMAIL_REGEX.test(str)) {
          throw new BadRequestException(
            `Question "${question.label}" requires a valid email`,
          );
        }
        serialized.push({ questionId: question.id, answerText: str });
        break;
      }

      case FeedbackQuestionType.PHONE:
        serialized.push({ questionId: question.id, answerText: String(value) });
        break;

      case FeedbackQuestionType.NUMBER: {
        const num = toNumber(value);
        if (num === null) {
          throw new BadRequestException(
            `Question "${question.label}" requires a number`,
          );
        }
        if (typeof validation.min === 'number' && num < validation.min) {
          throw new BadRequestException(
            `Question "${question.label}" must be >= ${validation.min}`,
          );
        }
        if (typeof validation.max === 'number' && num > validation.max) {
          throw new BadRequestException(
            `Question "${question.label}" must be <= ${validation.max}`,
          );
        }
        serialized.push({ questionId: question.id, answerNumber: num });
        break;
      }

      case FeedbackQuestionType.DATE: {
        const date = new Date(String(value));
        if (Number.isNaN(date.getTime())) {
          throw new BadRequestException(
            `Question "${question.label}" requires a valid date`,
          );
        }
        serialized.push({ questionId: question.id, answerDate: date });
        break;
      }

      case FeedbackQuestionType.MULTIPLE_CHOICE:
      case FeedbackQuestionType.DROPDOWN: {
        const str = String(value);
        if (options.length && !options.includes(str)) {
          throw new BadRequestException(
            `"${str}" is not a valid option for question "${question.label}"`,
          );
        }
        serialized.push({ questionId: question.id, answerText: str });
        break;
      }

      case FeedbackQuestionType.CHECKBOX: {
        if (!Array.isArray(value)) {
          throw new BadRequestException(
            `Question "${question.label}" requires a list of options`,
          );
        }
        const selected = value.map(String);
        const invalid = selected.filter((s) => !options.includes(s));
        if (options.length && invalid.length) {
          throw new BadRequestException(
            `Invalid option(s) for question "${question.label}": ${invalid.join(', ')}`,
          );
        }
        serialized.push({ questionId: question.id, answerOptions: selected });
        break;
      }

      case FeedbackQuestionType.YES_NO: {
        if (typeof value === 'boolean') {
          serialized.push({ questionId: question.id, answerBoolean: value });
        } else {
          const str = String(value).toLowerCase();
          if (!['yes', 'no', 'true', 'false', 'y', 'n'].includes(str)) {
            throw new BadRequestException(
              `Question "${question.label}" requires yes or no`,
            );
          }
          serialized.push({
            questionId: question.id,
            answerBoolean: str === 'yes' || str === 'true' || str === 'y',
          });
        }
        break;
      }

      case FeedbackQuestionType.RATING: {
        const num = toNumber(value);
        if (num === null || !Number.isInteger(num)) {
          throw new BadRequestException(
            `Question "${question.label}" requires a rating`,
          );
        }
        const scale = String(validation.scale ?? '1-5');
        let min = 1;
        let max = 5;
        if (scale === '1-10') {
          min = question.key === 'recommend' ? 0 : 1;
          max = 10;
        } else if (scale === 'stars' || scale === 'emoji') {
          min = 1;
          max = 5;
        }
        if (num < min || num > max) {
          throw new BadRequestException(
            `Rating for question "${question.label}" must be between ${min} and ${max}`,
          );
        }
        serialized.push({ questionId: question.id, answerNumber: num });
        if (question.key) {
          ratings[question.key] = num;
        }
        break;
      }

      case FeedbackQuestionType.FILE_UPLOAD:
        serialized.push({ questionId: question.id, answerText: String(value) });
        break;

      default:
        throw new BadRequestException(
          `Unsupported question type ${question.questionType}`,
        );
    }
  }

  for (const question of questions) {
    if (question.required && !seen.has(question.id)) {
      throw new BadRequestException(
        `Required question "${question.label}" was not answered`,
      );
    }
  }

  const overallScore =
    typeof ratings['overall'] === 'number' ? ratings['overall'] : null;
  const npsScore =
    typeof ratings['recommend'] === 'number' ? ratings['recommend'] : null;

  return { answers: serialized, ratings, overallScore, npsScore };
}

export function parseAnswersJson(raw: string): SubmittedAnswer[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException('answers must be a valid JSON array');
  }
  if (!Array.isArray(parsed)) {
    throw new BadRequestException('answers must be a JSON array');
  }
  return parsed as SubmittedAnswer[];
}
