import { Injectable } from '@nestjs/common';
import { FeedbackAccess } from '../types/feedback-access.type';
import { SubmitFeedbackDto } from '../dto/submit-feedback.dto';
import { UpdateFeedbackDto } from '../dto/update-feedback.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { FeedbackResponseService } from './feedback-response.service';
import type { UploadedFile } from '../dto/submit-feedback.dto';
import type { Request } from 'express';

/**
 * Facade coordinating the customer feedback flows. Keeps the controller thin
 * and exposes a single entry point for submission / editing / retrieval.
 */
@Injectable()
export class FeedbackService {
  constructor(private readonly responseService: FeedbackResponseService) {}

  submit(
    access: FeedbackAccess,
    dto: SubmitFeedbackDto,
    files: UploadedFile[],
    request: Request,
  ) {
    return this.responseService.submit(access, dto, files, request);
  }

  update(
    access: FeedbackAccess,
    responseId: string,
    dto: UpdateFeedbackDto,
    request: Request,
  ) {
    return this.responseService.update(access, responseId, dto, request);
  }

  getPending(access: FeedbackAccess, pagination: PaginationQueryDto) {
    return this.responseService.getPending(access, pagination);
  }

  getHistory(access: FeedbackAccess, pagination: PaginationQueryDto) {
    return this.responseService.getHistory(access, pagination);
  }

  getOne(access: FeedbackAccess, responseId: string, request: Request) {
    return this.responseService.getOne(access, responseId, request);
  }
}
