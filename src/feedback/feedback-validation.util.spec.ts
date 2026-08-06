import { BadRequestException } from '@nestjs/common';
import {
  parseAnswersJson,
  validateAndSerializeAnswers,
} from './feedback-validation.util';
import { FeedbackQuestionType } from './enums/feedback.enums';

function question(overrides: Record<string, unknown> = {}) {
  return {
    id: 'q1',
    label: 'Question 1',
    questionType: FeedbackQuestionType.SHORT_TEXT,
    required: false,
    ...overrides,
  };
}

describe('feedback-validation.util', () => {
  describe('parseAnswersJson', () => {
    it('parses a valid JSON array', () => {
      const result = parseAnswersJson('[{"questionId":"q1","value":"hi"}]');
      expect(result).toHaveLength(1);
      expect(result[0].questionId).toBe('q1');
    });

    it('rejects invalid JSON', () => {
      expect(() => parseAnswersJson('not-json')).toThrow(BadRequestException);
    });

    it('rejects non-array JSON', () => {
      expect(() => parseAnswersJson('{"questionId":"q1"}')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateAndSerializeAnswers', () => {
    it('rejects answers without a questionId', () => {
      expect(() =>
        validateAndSerializeAnswers(
          [question()],
          [{ questionId: '', value: 'x' }],
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects duplicate answers for the same question', () => {
      expect(() =>
        validateAndSerializeAnswers(
          [question()],
          [
            { questionId: 'q1', value: 'a' },
            { questionId: 'q1', value: 'b' },
          ],
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects answers for unknown questions', () => {
      expect(() =>
        validateAndSerializeAnswers(
          [question()],
          [{ questionId: 'nope', value: 'a' }],
        ),
      ).toThrow(BadRequestException);
    });

    it('enforces required questions', () => {
      const questions = [question({ id: 'q1', label: 'Name', required: true })];
      expect(() => validateAndSerializeAnswers(questions, [])).toThrow(
        BadRequestException,
      );
    });

    it('allows optional questions to be skipped', () => {
      const questions = [question({ id: 'q1', required: false })];
      const result = validateAndSerializeAnswers(questions, []);
      expect(result.answers).toHaveLength(0);
    });

    it('serializes text answers', () => {
      const result = validateAndSerializeAnswers(
        [question()],
        [{ questionId: 'q1', value: 'hello' }],
      );
      expect(result.answers[0]).toEqual({
        questionId: 'q1',
        answerText: 'hello',
      });
    });

    it('validates email format', () => {
      const questions = [
        question({ questionType: FeedbackQuestionType.EMAIL, label: 'Email' }),
      ];
      expect(() =>
        validateAndSerializeAnswers(questions, [
          { questionId: 'q1', value: 'not-an-email' },
        ]),
      ).toThrow(BadRequestException);
      const ok = validateAndSerializeAnswers(questions, [
        { questionId: 'q1', value: 'a@b.com' },
      ]);
      expect(ok.answers[0].answerText).toBe('a@b.com');
    });

    it('validates number ranges', () => {
      const questions = [
        question({
          questionType: FeedbackQuestionType.NUMBER,
          label: 'Count',
          validation: { min: 1, max: 10 },
        }),
      ];
      expect(() =>
        validateAndSerializeAnswers(questions, [
          { questionId: 'q1', value: 0 },
        ]),
      ).toThrow(BadRequestException);
      expect(() =>
        validateAndSerializeAnswers(questions, [
          { questionId: 'q1', value: 11 },
        ]),
      ).toThrow(BadRequestException);
      const ok = validateAndSerializeAnswers(questions, [
        { questionId: 'q1', value: '5' },
      ]);
      expect(ok.answers[0].answerNumber).toBe(5);
    });

    it('rejects invalid dates', () => {
      const questions = [
        question({ questionType: FeedbackQuestionType.DATE, label: 'Date' }),
      ];
      expect(() =>
        validateAndSerializeAnswers(questions, [
          { questionId: 'q1', value: 'not-a-date' },
        ]),
      ).toThrow(BadRequestException);
    });

    it('validates multiple choice against options', () => {
      const questions = [
        question({
          questionType: FeedbackQuestionType.MULTIPLE_CHOICE,
          label: 'Pick',
          options: ['a', 'b'],
        }),
      ];
      expect(() =>
        validateAndSerializeAnswers(questions, [
          { questionId: 'q1', value: 'zzz' },
        ]),
      ).toThrow(BadRequestException);
      const ok = validateAndSerializeAnswers(questions, [
        { questionId: 'q1', value: 'b' },
      ]);
      expect(ok.answers[0].answerText).toBe('b');
    });

    it('validates checkboxes as option lists', () => {
      const questions = [
        question({
          questionType: FeedbackQuestionType.CHECKBOX,
          label: 'Multi',
          options: ['a', 'b'],
        }),
      ];
      expect(() =>
        validateAndSerializeAnswers(questions, [
          { questionId: 'q1', value: 'not-an-array' },
        ]),
      ).toThrow(BadRequestException);
      expect(() =>
        validateAndSerializeAnswers(questions, [
          { questionId: 'q1', value: ['a', 'zzz'] },
        ]),
      ).toThrow(BadRequestException);
      const ok = validateAndSerializeAnswers(questions, [
        { questionId: 'q1', value: ['a'] },
      ]);
      expect(ok.answers[0].answerOptions).toEqual(['a']);
    });

    it('accepts yes/no answers', () => {
      const questions = [
        question({ questionType: FeedbackQuestionType.YES_NO, label: 'YN' }),
      ];
      const ok = validateAndSerializeAnswers(questions, [
        { questionId: 'q1', value: 'yes' },
      ]);
      expect(ok.answers[0].answerBoolean).toBe(true);
    });

    it('rejects invalid yes/no values', () => {
      const questions = [
        question({ questionType: FeedbackQuestionType.YES_NO, label: 'YN' }),
      ];
      expect(() =>
        validateAndSerializeAnswers(questions, [
          { questionId: 'q1', value: 'maybe' },
        ]),
      ).toThrow(BadRequestException);
    });

    it('collects rating metrics by key and computes scores', () => {
      const questions = [
        question({
          id: 'q-overall',
          questionType: FeedbackQuestionType.RATING,
          key: 'overall',
          label: 'Overall',
        }),
        question({
          id: 'q-recommend',
          questionType: FeedbackQuestionType.RATING,
          key: 'recommend',
          label: 'Recommend',
          validation: { scale: '1-10' },
        }),
      ];
      const result = validateAndSerializeAnswers(questions, [
        { questionId: 'q-overall', value: 4 },
        { questionId: 'q-recommend', value: 9 },
      ]);
      expect(result.ratings).toEqual({ overall: 4, recommend: 9 });
      expect(result.overallScore).toBe(4);
      expect(result.npsScore).toBe(9);
    });

    it('rejects ratings out of range', () => {
      const questions = [
        question({
          questionType: FeedbackQuestionType.RATING,
          label: 'Rate',
          key: 'overall',
        }),
      ];
      expect(() =>
        validateAndSerializeAnswers(questions, [
          { questionId: 'q1', value: 11 },
        ]),
      ).toThrow(BadRequestException);
    });
  });
});
