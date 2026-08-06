import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FeedbackAccessGuard } from './guards/feedback-access.guard';
import { Access } from './decorators/access.decorator';
import type { FeedbackAccess } from './types/feedback-access.type';
import { FeedbackService } from './services/feedback.service';
import { FeedbackFormService } from './services/feedback-form.service';
import { FeedbackSearchService } from './services/feedback-search.service';
import { FeedbackAnalyticsService } from './services/feedback-analytics.service';
import { FeedbackDashboardService } from './services/feedback-dashboard.service';
import { CreateFeedbackFormDto } from './dto/create-feedback-form.dto';
import { UpdateFeedbackFormDto } from './dto/update-feedback-form.dto';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import type { UploadedFile } from './dto/submit-feedback.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
import { SearchFeedbackDto } from './dto/search-feedback.dto';
import {
  FeedbackAnalyticsQueryDto,
  FeedbackDashboardQueryDto,
} from './dto/feedback-analytics-query.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import type { Request } from 'express';

@ApiTags('Feedback')
@ApiBearerAuth()
@UseGuards(FeedbackAccessGuard)
@Controller('feedback')
export class FeedbackController {
  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly formService: FeedbackFormService,
    private readonly searchService: FeedbackSearchService,
    private readonly analyticsService: FeedbackAnalyticsService,
    private readonly dashboardService: FeedbackDashboardService,
  ) {}

  // -------------------------------------------------------------------------
  // Forms
  // -------------------------------------------------------------------------

  @Get('forms')
  @ApiOperation({ summary: 'List feedback forms' })
  @ApiResponse({
    status: 200,
    description: 'Forms returned',
    schema: {
      example: {
        items: [
          {
            id: 'frm_123',
            title: 'Post-resolution satisfaction survey',
            status: 'ACTIVE',
            isSatisfactionSurvey: true,
            category: null,
            _count: { questions: 5, responses: 12 },
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      },
    },
  })
  async listForms(
    @Access() access: FeedbackAccess,
    @Query() query: PaginationQueryDto,
  ) {
    return this.formService.list(access, query);
  }

  @Get('forms/:id')
  @ApiOperation({ summary: 'Get a feedback form with its questions' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Form returned',
    schema: {
      example: {
        id: 'frm_123',
        title: 'Post-resolution satisfaction survey',
        description: 'How was your overall experience?',
        status: 'ACTIVE',
        isSatisfactionSurvey: true,
        allowMultipleResponses: false,
        requireComment: false,
        questions: [
          {
            id: 'q_1',
            questionType: 'RATING',
            label: 'Overall, how satisfied are you?',
            key: 'overall',
            required: true,
            validation: { scale: '1-5' },
            sortOrder: 0,
          },
        ],
      },
    },
  })
  async getForm(@Access() access: FeedbackAccess, @Param('id') id: string) {
    return this.formService.getOne(access, id);
  }

  @Post('forms')
  @ApiOperation({ summary: 'Create a feedback form' })
  @ApiBody({ type: CreateFeedbackFormDto })
  @ApiResponse({
    status: 201,
    description: 'Form created',
    schema: {
      example: {
        id: 'frm_124',
        title: 'Post-resolution satisfaction survey',
        status: 'DRAFT',
        isSatisfactionSurvey: true,
        createdById: 'usr_1',
        questions: [
          {
            id: 'q_1',
            questionType: 'RATING',
            label: 'Overall, how satisfied are you?',
            key: 'overall',
            required: true,
            validation: { scale: '1-5' },
            sortOrder: 0,
          },
        ],
      },
    },
  })
  async createForm(
    @Access() access: FeedbackAccess,
    @Body() dto: CreateFeedbackFormDto,
    @Req() req: Request,
  ) {
    return this.formService.create(access, dto, req);
  }

  @Patch('forms/:id')
  @ApiOperation({ summary: 'Update a feedback form' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: UpdateFeedbackFormDto })
  @ApiResponse({
    status: 200,
    description: 'Form updated',
    schema: {
      example: {
        id: 'frm_123',
        title: 'Post-resolution satisfaction survey (v2)',
        status: 'ACTIVE',
        isSatisfactionSurvey: true,
        questions: [
          {
            id: 'q_1',
            questionType: 'RATING',
            label: 'Overall, how satisfied are you?',
            key: 'overall',
            required: true,
          },
        ],
      },
    },
  })
  async updateForm(
    @Access() access: FeedbackAccess,
    @Param('id') id: string,
    @Body() dto: UpdateFeedbackFormDto,
    @Req() req: Request,
  ) {
    return this.formService.update(access, id, dto, req);
  }

  @Delete('forms/:id')
  @ApiOperation({
    summary: 'Delete a feedback form (archives it if responses already exist)',
  })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Form deleted or archived',
    schema: {
      example: {
        id: 'frm_123',
        status: 'ARCHIVED',
      },
    },
  })
  async deleteForm(
    @Access() access: FeedbackAccess,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.formService.remove(access, id, req);
  }

  // -------------------------------------------------------------------------
  // Customer flows
  // -------------------------------------------------------------------------

  @Get('pending')
  @ApiOperation({ summary: 'List pending surveys for the current customer' })
  @ApiResponse({
    status: 200,
    description: 'Pending surveys returned',
    schema: {
      example: {
        items: [
          {
            id: 'req_123',
            status: 'PENDING',
            expiresAt: '2026-08-11T00:00:00.000Z',
            form: {
              id: 'frm_123',
              title: 'Post-resolution satisfaction survey',
              welcomeMessage: 'Thanks for your time!',
            },
            ticket: {
              id: 'tkt_123',
              ticketNumber: 'SF-1042',
              subject: 'Unable to log in',
              status: 'RESOLVED',
            },
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      },
    },
  })
  async getPending(
    @Access() access: FeedbackAccess,
    @Query() query: PaginationQueryDto,
  ) {
    return this.feedbackService.getPending(access, query);
  }

  @Get('history')
  @ApiOperation({ summary: 'List submitted feedback for the current customer' })
  @ApiResponse({
    status: 200,
    description: 'Feedback history returned',
    schema: {
      example: {
        items: [
          {
            id: 'resp_1',
            overallScore: 5,
            publicComment: 'Great support!',
            submittedAt: '2026-08-03T14:00:00.000Z',
            form: {
              id: 'frm_123',
              title: 'Post-resolution satisfaction survey',
            },
            ticket: {
              id: 'tkt_123',
              ticketNumber: 'SF-1042',
              subject: 'Unable to log in',
            },
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      },
    },
  })
  async getHistory(
    @Access() access: FeedbackAccess,
    @Query() query: PaginationQueryDto,
  ) {
    return this.feedbackService.getHistory(access, query);
  }

  @Post('submit')
  @ApiOperation({ summary: 'Submit feedback for a resolved/closed ticket' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SubmitFeedbackDto })
  @ApiResponse({
    status: 201,
    description: 'Feedback submitted',
    schema: {
      example: {
        id: 'resp_2',
        status: 'SUBMITTED',
        overallScore: 5,
        npsScore: 9,
        publicComment: 'The agent was very helpful, thank you!',
        submittedAt: '2026-08-04T09:30:00.000Z',
        form: { id: 'frm_123', title: 'Post-resolution satisfaction survey' },
        ticket: {
          id: 'tkt_123',
          ticketNumber: 'SF-1042',
          subject: 'Unable to log in',
        },
        answers: [
          {
            id: 'ans_1',
            question: {
              id: 'q_1',
              questionType: 'RATING',
              label: 'Overall satisfaction',
            },
            answerNumber: 5,
          },
        ],
        attachments: [
          {
            id: 'att_1',
            originalName: 'screenshot.png',
            mimeType: 'image/png',
            publicUrl:
              'https://supabase.example/storage/v1/object/public/supportflow/feedback/org_1/screenshot.png',
          },
        ],
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 10))
  async submit(
    @Access() access: FeedbackAccess,
    @Body() dto: SubmitFeedbackDto,
    @UploadedFiles() files: UploadedFile[],
    @Req() req: Request,
  ) {
    return this.feedbackService.submit(access, dto, files ?? [], req);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing feedback response' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiBody({ type: UpdateFeedbackDto })
  @ApiResponse({
    status: 200,
    description: 'Feedback updated',
    schema: {
      example: {
        id: 'resp_2',
        status: 'EDITED',
        overallScore: 4,
        publicComment: 'Updating my rating after the follow-up call.',
        editedAt: '2026-08-04T11:00:00.000Z',
        form: { id: 'frm_123', title: 'Post-resolution satisfaction survey' },
        ticket: {
          id: 'tkt_123',
          ticketNumber: 'SF-1042',
          subject: 'Unable to log in',
        },
      },
    },
  })
  async update(
    @Access() access: FeedbackAccess,
    @Param('id') id: string,
    @Body() dto: UpdateFeedbackDto,
    @Req() req: Request,
  ) {
    return this.feedbackService.update(access, id, dto, req);
  }

  // -------------------------------------------------------------------------
  // Analytics / dashboard / search
  // -------------------------------------------------------------------------

  @Get('analytics')
  @ApiOperation({
    summary: 'Feedback analytics (ratings, response rates, trends)',
  })
  @ApiResponse({
    status: 200,
    description: 'Analytics returned',
    schema: {
      example: {
        summary: {
          totalResponses: 42,
          totalRequests: 60,
          responseRate: 70,
          completionRate: 65,
          averageRating: 4.2,
          cSat: 84,
          nps: 52,
          averageResolutionSatisfaction: 4.1,
          averageAgentRating: 4.3,
          averageResponseSpeed: 4,
          averageCommunication: 4.4,
        },
        ratingDistribution: { 1: 2, 2: 3, 3: 5, 4: 14, 5: 18 },
        mostCommonRatings: [{ rating: 5, count: 18 }],
        trends: [{ period: '2026-08', count: 12, average: 4.4 }],
        surveyComparison: [
          {
            formId: 'frm_123',
            title: 'Post-resolution satisfaction survey',
            responses: 42,
            averageRating: 4.2,
            nps: 52,
          },
        ],
        organizationComparison: [
          {
            organizationId: 'org_1',
            name: 'Acme Inc',
            responses: 42,
            averageRating: 4.2,
            nps: 52,
          },
        ],
      },
    },
  })
  async getAnalytics(
    @Access() access: FeedbackAccess,
    @Query() query: FeedbackAnalyticsQueryDto,
  ) {
    return this.analyticsService.getAnalytics(access, query);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Feedback dashboard metrics' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard metrics returned',
    schema: {
      example: {
        averageRating: 4.2,
        cSat: 84,
        nps: 52,
        pending: 18,
        completed: 42,
        responsePercentage: 70,
        ratingDistribution: { 1: 2, 2: 3, 3: 5, 4: 14, 5: 18 },
        recentFeedback: [
          {
            id: 'resp_1',
            ticketNumber: 'SF-1042',
            customerName: 'John Doe',
            overallScore: 5,
            publicComment: 'Great support!',
            submittedAt: '2026-08-03T14:00:00.000Z',
            surveyTitle: 'Post-resolution satisfaction survey',
          },
        ],
      },
    },
  })
  async getDashboard(
    @Access() access: FeedbackAccess,
    @Query() query: FeedbackDashboardQueryDto,
  ) {
    return this.dashboardService.getDashboard(access, query);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search and filter feedback responses with pagination',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results returned',
    schema: {
      example: {
        items: [
          {
            id: 'resp_1',
            overallScore: 5,
            status: 'SUBMITTED',
            publicComment: 'Great support!',
            form: {
              id: 'frm_123',
              title: 'Post-resolution satisfaction survey',
            },
            ticket: {
              id: 'tkt_123',
              ticketNumber: 'SF-1042',
              subject: 'Unable to log in',
              status: 'RESOLVED',
              assignedTo: {
                id: 'usr_9',
                firstName: 'Jane',
                lastName: 'Agent',
                email: 'jane@acme.com',
              },
            },
            submittedBy: {
              id: 'usr_1',
              firstName: 'John',
              lastName: 'Doe',
              email: 'john@acme.com',
            },
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    },
  })
  async search(
    @Access() access: FeedbackAccess,
    @Query() query: SearchFeedbackDto,
  ) {
    return this.searchService.search(access, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get feedback response details' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Feedback details returned',
    schema: {
      example: {
        id: 'resp_1',
        overallScore: 5,
        npsScore: 9,
        status: 'SUBMITTED',
        publicComment: 'Great support!',
        privateComment: 'The team was very responsive.',
        submittedAt: '2026-08-03T14:00:00.000Z',
        form: { id: 'frm_123', title: 'Post-resolution satisfaction survey' },
        ticket: {
          id: 'tkt_123',
          ticketNumber: 'SF-1042',
          subject: 'Unable to log in',
          status: 'RESOLVED',
          assignedTo: {
            id: 'usr_9',
            firstName: 'Jane',
            lastName: 'Agent',
            email: 'jane@acme.com',
          },
        },
        submittedBy: {
          id: 'usr_1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@acme.com',
        },
        answers: [
          {
            id: 'ans_1',
            question: {
              id: 'q_1',
              questionType: 'RATING',
              label: 'Overall satisfaction',
            },
            answerNumber: 5,
          },
        ],
        attachments: [],
        request: {
          id: 'req_123',
          status: 'COMPLETED',
          submittedAt: '2026-08-03T14:00:00.000Z',
        },
      },
    },
  })
  async getOne(
    @Access() access: FeedbackAccess,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.feedbackService.getOne(access, id, req);
  }
}
