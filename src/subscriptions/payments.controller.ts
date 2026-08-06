import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionAccessGuard } from './guards/subscription-access.guard';
import { Access } from './decorators/access.decorator';
import type { SubscriptionAccess } from './enums/subscription.enums';
import { BillingIntervalValue } from './enums/subscription.enums';
import { PaymentService } from './services/payment.service';
import { WebhookService } from './services/webhook.service';
import { InvoiceService } from './services/invoice.service';
import { PlanService } from './services/plan.service';
import { CheckoutDto } from './dto/checkout.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { WebhookDto } from './dto/webhook.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly webhookService: WebhookService,
    private readonly invoiceService: InvoiceService,
    private readonly planService: PlanService,
  ) {}

  // --------------------------------------------------------------------------
  // Public webhook (no JWT)
  // --------------------------------------------------------------------------

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'PayChangu webhook endpoint (signature verified)' })
  @ApiHeader({
    name: 'x-webhook-signature',
    description: 'HMAC-SHA256 signature over the raw request body.',
    required: true,
  })
  @ApiBody({ type: WebhookDto, description: 'Raw gateway event payload.' })
  @ApiCreatedResponse({
    description: 'Webhook acknowledged.',
    example: {
      received: true,
      processed: true,
      outcome: 'SUCCESSFUL',
      paymentId: 'pay_1',
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid webhook signature.' })
  async webhook(
    @Req() request: Request,
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-signature') altSignature: string,
    @Body() body: any,
  ) {
    const sig = signature ?? altSignature;
    if (!sig) {
      throw new BadRequestException('Missing webhook signature header.');
    }

    const rawBody = this.resolveRawBody(request);

    return this.webhookService.handle(rawBody, sig, body);
  }

  // --------------------------------------------------------------------------
  // Authenticated endpoints (staff only)
  // --------------------------------------------------------------------------

  @Post('checkout')
  @UseGuards(SubscriptionAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate a PayChangu checkout session for a plan' })
  @ApiCreatedResponse({
    description: 'Checkout session generated.',
    example: {
      checkoutUrl: 'https://checkout.paychangu.com/...',
      reference: 'sf_abc',
      paymentId: 'pay_1',
    },
  })
  async checkout(
    @Body() dto: CheckoutDto,
    @Access() access: SubscriptionAccess,
    @Req() request: Request,
  ) {
    this.assertTenantAdmin(access);
    const organizationId = this.requireOrganizationId(access);

    const plan = await this.planService.getById(dto.planId);
    if (!plan.isActive) {
      throw new BadRequestException('This plan is not available for purchase.');
    }

    const interval = dto.billingInterval ?? BillingIntervalValue.MONTHLY;

    // Link the checkout to the current subscription and mark payment pending.
    const subscription = await (
      this.prisma as any
    ).organizationSubscription.findFirst({
      where: { organizationId: access.organizationId },
      orderBy: { createdAt: 'desc' },
    });

    if (subscription) {
      await (this.prisma as any).organizationSubscription.update({
        where: { id: subscription.id },
        data: {
          status: 'PENDING_PAYMENT',
          pendingPlanId: plan.id,
          billingInterval: interval,
        },
      });
    }

    return this.paymentService.initiateCheckout({
      organizationId,
      subscriptionId: subscription?.id ?? null,
      plan,
      billingInterval: interval,
      description: `${plan.name} (${interval})`,
      returnUrl: dto.returnUrl,
      callbackUrl: dto.callbackUrl,
      access,
      request,
      metadata: { changeType: 'CHECKOUT' },
    });
  }

  @Post('verify')
  @UseGuards(SubscriptionAccessGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a payment server-side with the gateway' })
  @ApiOkResponse({
    description: 'Payment verified (idempotent).',
    example: {
      reference: 'sf_abc',
      status: 'SUCCESSFUL',
      amount: 49,
      currency: 'USD',
    },
  })
  async verify(
    @Body() dto: VerifyPaymentDto,
    @Access() access: SubscriptionAccess,
  ) {
    const organizationId = this.requireOrganizationId(access);
    return this.paymentService.verifyPayment({
      organizationId,
      reference: dto.reference,
      access,
      redirectUrl: dto.redirectUrl,
    });
  }

  @Get('history')
  @UseGuards(SubscriptionAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List payment history for the organization' })
  @ApiOkResponse({ description: 'Payment history returned.' })
  async history(
    @Query() query: PaginationQueryDto,
    @Access() access: SubscriptionAccess,
  ) {
    const organizationId = this.requireOrganizationId(access);
    return this.paymentService.history(
      organizationId,
      Number(query.page ?? 1),
      Number(query.limit ?? 10),
    );
  }

  @Get(':id')
  @UseGuards(SubscriptionAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single payment by id' })
  @ApiParam({ name: 'id', example: 'pay_1' })
  @ApiOkResponse({ description: 'Payment returned.' })
  async getById(@Param('id') id: string, @Access() access: SubscriptionAccess) {
    const organizationId = this.requireOrganizationId(access);
    return this.paymentService.getById(
      organizationId,
      id,
      access.isPlatformAdmin,
    );
  }

  // --------------------------------------------------------------------------
  // Invoices
  // --------------------------------------------------------------------------

  @Get('invoices')
  @UseGuards(SubscriptionAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List invoices for the organization' })
  @ApiOkResponse({ description: 'Invoices returned.' })
  async invoices(
    @Query() query: PaginationQueryDto,
    @Access() access: SubscriptionAccess,
  ) {
    const organizationId = this.requireOrganizationId(access);
    return this.invoiceService.list(
      organizationId,
      Number(query.page ?? 1),
      Number(query.limit ?? 10),
    );
  }

  @Get('invoices/:id')
  @UseGuards(SubscriptionAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single invoice by id' })
  @ApiParam({ name: 'id', example: 'inv_1' })
  @ApiOkResponse({ description: 'Invoice returned.' })
  async getInvoice(
    @Param('id') id: string,
    @Access() access: SubscriptionAccess,
  ) {
    const organizationId = this.requireOrganizationId(access);
    return this.invoiceService.getById(
      organizationId,
      id,
      access.isPlatformAdmin,
    );
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

  private assertTenantAdmin(access: SubscriptionAccess) {
    if (access.isPlatformAdmin) return;
    if (access.isOwner || access.isAdmin) return;
    throw new ForbiddenException(
      'Only tenant owners and administrators can manage payments.',
    );
  }

  private resolveRawBody(request: Request): Buffer | string {
    const raw = (request as any).rawBody;
    if (raw && (Buffer.isBuffer(raw) || typeof raw === 'string')) {
      return raw;
    }
    // Fallback: serialize the parsed body (weaker but better than failing).
    return JSON.stringify((request as any).body ?? {});
  }
}
