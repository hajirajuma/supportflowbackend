import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { SubscriptionAccessGuard } from './guards/subscription-access.guard';
import type { SubscriptionAccess } from './enums/subscription.enums';
import { Access } from './decorators/access.decorator';
import { PlanService } from './services/plan.service';
import { SubscriptionService } from './services/subscription.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { UpgradePlanDto } from './dto/upgrade-plan.dto';
import { DowngradePlanDto } from './dto/downgrade-plan.dto';
import { RenewSubscriptionDto } from './dto/renew-subscription.dto';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';
import { ResumeSubscriptionDto } from './dto/resume-subscription.dto';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentication is required.' })
@UseGuards(SubscriptionAccessGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly planService: PlanService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  // --------------------------------------------------------------------------
  // Plans
  // --------------------------------------------------------------------------

  @Get('plans')
  @ApiOperation({ summary: 'List subscription plans (public to staff)' })
  @ApiOkResponse({ description: 'List of plans returned.' })
  listPlans(@Access() access: SubscriptionAccess) {
    this.assertNotCustomer(access);
    return this.planService.list(access.isPlatformAdmin);
  }

  @Get('plans/:id')
  @ApiOperation({ summary: 'Get a subscription plan by id' })
  @ApiParam({ name: 'id', example: 'clxabc123' })
  @ApiOkResponse({ description: 'Plan returned.' })
  async getPlan(@Param('id') id: string, @Access() access: SubscriptionAccess) {
    this.assertNotCustomer(access);
    return this.planService.getById(id);
  }

  @Post('plans')
  @ApiOperation({ summary: 'Create a subscription plan (platform admin only)' })
  @ApiCreatedResponse({
    description: 'Plan created.',
    example: { id: 'clxabc123', code: 'PRO', name: 'Pro' },
  })
  @ApiForbiddenResponse({
    description: 'Only platform administrators can manage plans.',
  })
  async createPlan(
    @Body() dto: CreatePlanDto,
    @Access() access: SubscriptionAccess,
  ) {
    return this.planService.create(dto, access);
  }

  @Patch('plans/:id')
  @ApiOperation({ summary: 'Update a subscription plan (platform admin only)' })
  @ApiParam({ name: 'id', example: 'clxabc123' })
  @ApiOkResponse({ description: 'Plan updated.' })
  @ApiForbiddenResponse({
    description: 'Only platform administrators can manage plans.',
  })
  async updatePlan(
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
    @Access() access: SubscriptionAccess,
  ) {
    return this.planService.update(id, dto, access);
  }

  @Delete('plans/:id')
  @ApiOperation({
    summary: 'Delete (or deactivate) a subscription plan (platform admin only)',
  })
  @ApiParam({ name: 'id', example: 'clxabc123' })
  @ApiOkResponse({ description: 'Plan deleted or deactivated.' })
  @ApiForbiddenResponse({
    description: 'Only platform administrators can manage plans.',
  })
  async deletePlan(
    @Param('id') id: string,
    @Access() access: SubscriptionAccess,
  ) {
    return this.planService.remove(id, access);
  }

  // --------------------------------------------------------------------------
  // Current subscription
  // --------------------------------------------------------------------------

  @Get('current')
  @ApiOperation({
    summary: 'Get the current subscription, trial and entitlements',
  })
  @ApiOkResponse({ description: 'Current subscription returned.' })
  current(@Access() access: SubscriptionAccess) {
    const organizationId = this.requireOrganizationId(access);
    return this.subscriptionService.getCurrent(organizationId, access);
  }

  // --------------------------------------------------------------------------
  // Plan changes
  // --------------------------------------------------------------------------

  @Post('upgrade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upgrade the subscription (generates a checkout session)',
  })
  @ApiOkResponse({
    description: 'Checkout session generated.',
    example: {
      checkoutUrl: 'https://checkout.paychangu.com/...',
      reference: 'sf_abc123',
      paymentId: 'pay_1',
    },
  })
  @ApiBadRequestResponse({
    description: 'Plan is not purchasable / is a downgrade.',
  })
  async upgrade(
    @Body() dto: UpgradePlanDto,
    @Access() access: SubscriptionAccess,
    @Req() request: Request,
  ) {
    const organizationId = this.requireOrganizationId(access);
    return this.subscriptionService.upgrade(
      organizationId,
      dto,
      access,
      request,
    );
  }

  @Post('downgrade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Downgrade the subscription (immediate or at period end)',
  })
  @ApiOkResponse({ description: 'Subscription downgraded or scheduled.' })
  @ApiBadRequestResponse({
    description: 'Plan is not available / is an upgrade.',
  })
  async downgrade(
    @Body() dto: DowngradePlanDto,
    @Access() access: SubscriptionAccess,
    @Req() request: Request,
  ) {
    const organizationId = this.requireOrganizationId(access);
    return this.subscriptionService.downgrade(
      organizationId,
      dto,
      access,
      request,
    );
  }

  @Post('renew')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renew the subscription (generates a checkout session)',
  })
  @ApiOkResponse({ description: 'Renewal checkout generated.' })
  async renew(
    @Body() dto: RenewSubscriptionDto,
    @Access() access: SubscriptionAccess,
    @Req() request: Request,
  ) {
    const organizationId = this.requireOrganizationId(access);
    return this.subscriptionService.renew(organizationId, dto, access, request);
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel the subscription (immediately or at period end)',
  })
  @ApiOkResponse({
    description: 'Subscription cancelled.',
    example: { status: 'ACTIVE', cancelAtPeriodEnd: true },
  })
  async cancel(
    @Body() dto: CancelSubscriptionDto,
    @Access() access: SubscriptionAccess,
    @Req() request: Request,
  ) {
    const organizationId = this.requireOrganizationId(access);
    return this.subscriptionService.cancel(
      organizationId,
      dto,
      access,
      request,
    );
  }

  @Post('resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a cancelled subscription' })
  @ApiOkResponse({ description: 'Subscription resumed or checkout generated.' })
  async resume(
    @Body() dto: ResumeSubscriptionDto,
    @Access() access: SubscriptionAccess,
    @Req() request: Request,
  ) {
    const organizationId = this.requireOrganizationId(access);
    return this.subscriptionService.resume(
      organizationId,
      dto,
      access,
      request,
    );
  }

  // --------------------------------------------------------------------------
  // Usage
  // --------------------------------------------------------------------------

  @Get('usage')
  @ApiOperation({ summary: 'Get current usage vs plan limits' })
  @ApiOkResponse({
    description: 'Usage returned.',
    example: {
      plan: { planCode: 'PRO' },
      usage: {
        users: { current: 5, limit: 10 },
        storageBytes: { current: 1024, limit: 5368709120, unit: 'bytes' },
      },
    },
  })
  async usage(@Access() access: SubscriptionAccess) {
    const organizationId = this.requireOrganizationId(access);
    return this.subscriptionService.usage(organizationId);
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private requireOrganizationId(access: SubscriptionAccess): string {
    if (!access.organizationId) {
      throw new BadRequestException(
        'Organization context is missing. Provide an x-organization-id header.',
      );
    }
    return access.organizationId;
  }

  private assertNotCustomer(access: SubscriptionAccess) {
    if (access.isCustomer) {
      throw new ForbiddenException(
        'Customers do not have access to subscription features.',
      );
    }
  }
}
