"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const bcrypt = __importStar(require("bcrypt"));
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("../generated/prisma/client");
const adapter = new adapter_pg_1.PrismaPg({
    connectionString: process.env.DATABASE_URL ?? '',
});
const prisma = new client_1.PrismaClient({ adapter });
const GB = 1024 * 1024 * 1024;
const defaultSystemSettings = [
    {
        key: 'app_name',
        value: 'SupportFlow',
        description: 'Application display name',
    },
    {
        key: 'default_timezone',
        value: 'UTC',
        description: 'Default timezone for newly created organizations',
    },
    {
        key: 'default_language',
        value: 'en-US',
        description: 'Default language for newly created organizations',
    },
    {
        key: 'support_email',
        value: 'support@example.com',
        description: 'Default support email address',
    },
    {
        key: 'allow_public_feedback',
        value: true,
        description: 'Whether public feedback forms are allowed by default',
    },
    {
        key: 'feedback_request_delay_hours',
        value: 24,
        description: 'Default delay before feedback requests are sent',
    },
    {
        key: 'ticket_auto_close_days',
        value: 7,
        description: 'Default days to auto-close tickets',
    },
    {
        key: 'trial_days',
        value: 14,
        description: 'Default free trial length in days',
    },
];
const defaultFeedbackCategories = [
    {
        name: 'Bug Reports',
        description: 'Issues affecting product quality or reliability',
    },
    {
        name: 'Feature Requests',
        description: 'Ideas and enhancements requested by users',
    },
    {
        name: 'General Feedback',
        description: 'Broad feedback about the product experience',
    },
    {
        name: 'Performance',
        description: 'Speed, availability, and reliability concerns',
    },
];
const PERMISSION_CODES = [
    'USER_CREATE', 'USER_READ', 'USER_UPDATE', 'USER_DELETE', 'USER_SUSPEND',
    'USER_ACTIVATE', 'ROLE_CREATE', 'ROLE_READ', 'ROLE_UPDATE', 'ROLE_DELETE',
    'ROLE_ASSIGN', 'DEPARTMENT_CREATE', 'DEPARTMENT_READ', 'DEPARTMENT_UPDATE',
    'DEPARTMENT_DELETE', 'DEPARTMENT_MANAGE_MEMBERS', 'TICKET_CREATE',
    'TICKET_READ', 'TICKET_UPDATE', 'TICKET_DELETE', 'TICKET_ASSIGN',
    'TICKET_RESOLVE', 'TICKET_CLOSE', 'TICKET_MERGE', 'TICKET_SPLIT',
    'TICKET_VIEW_ALL', 'TICKET_VIEW_OWN', 'EVIDENCE_UPLOAD', 'EVIDENCE_READ',
    'EVIDENCE_DELETE', 'FEEDBACK_CREATE', 'FEEDBACK_READ', 'FEEDBACK_UPDATE',
    'FEEDBACK_DELETE', 'FEEDBACK_FORM_CREATE', 'FEEDBACK_FORM_READ',
    'FEEDBACK_FORM_UPDATE', 'FEEDBACK_FORM_DELETE', 'FEEDBACK_VIEW_ALL',
    'KNOWLEDGE_READ', 'KNOWLEDGE_CREATE', 'KNOWLEDGE_UPDATE', 'KNOWLEDGE_DELETE',
    'KNOWLEDGE_PUBLISH', 'SLA_CREATE', 'SLA_READ', 'SLA_UPDATE', 'SLA_DELETE',
    'SLA_VIEW_ALL', 'SETTINGS_READ', 'SETTINGS_UPDATE', 'SUBSCRIPTION_READ',
    'SUBSCRIPTION_UPDATE', 'SUBSCRIPTION_CANCEL', 'REPORT_READ', 'REPORT_EXPORT',
    'AUDIT_LOG_READ', 'API_KEY_CREATE', 'API_KEY_READ', 'API_KEY_REVOKE',
    'SYSTEM_SETTINGS_UPDATE', 'ANNOUNCEMENT_CREATE', 'ANNOUNCEMENT_UPDATE',
    'ANNOUNCEMENT_DELETE',
];
const ROLE_PERMISSIONS = {
    PLATFORM_ADMIN: [...PERMISSION_CODES],
    TENANT_OWNER: PERMISSION_CODES.filter((code) => code !== 'SYSTEM_SETTINGS_UPDATE'),
    SUPPORT_AGENT: PERMISSION_CODES.filter((code) => [
        'TICKET', 'KNOWLEDGE', 'FEEDBACK', 'EVIDENCE', 'DEPARTMENT_READ',
        'USER_READ',
    ].some((prefix) => code.startsWith(prefix))),
    CUSTOMER: [
        'TICKET_CREATE', 'TICKET_READ', 'TICKET_UPDATE', 'FEEDBACK_CREATE',
        'FEEDBACK_READ', 'FEEDBACK_UPDATE', 'KNOWLEDGE_READ', 'EVIDENCE_UPLOAD',
        'EVIDENCE_READ',
    ],
};
async function seedPlatformAdmin() {
    if (process.env.NODE_ENV === "production" && (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)) {
        throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set when NODE_ENV=production");
    }
    const email = process.env.ADMIN_EMAIL ?? "admin@supportflow.com";
    const password = process.env.ADMIN_PASSWORD ?? "Admin@12H!456";
    const hashedPassword = await bcrypt.hash(password, 12);
    const existingAdmin = await prisma.user.findFirst({ where: { email } });
    const data = {
        firstName: 'Platform',
        lastName: 'Administrator',
        role: 'PLATFORM_ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        password: hashedPassword,
        organizationId: null,
    };
    if (existingAdmin) {
        return prisma.user.update({ where: { id: existingAdmin.id }, data });
    }
    return prisma.user.create({ data: { email, ...data } });
}
const subscriptionPlans = [
    {
        code: 'FREE', name: 'Free', type: 'FREE',
        description: 'Best for small teams getting started',
        priceMonthly: 0, priceYearly: 0, currency: 'USD',
        trialDays: 14, sortOrder: 1,
        maxUsers: 3, maxCustomers: 100, maxAgents: 1,
        maxTicketsPerMonth: 250, maxFeedbackForms: 1,
        maxAttachmentsPerTicket: 5, maxKnowledgeArticles: 10,
        maxInvitations: 5, storageLimitBytes: 1 * GB, apiMonthlyQuota: 5000,
        features: {
            ticket_management: true, knowledge_base: false, feedback: true,
            customer_portal: true, custom_branding: false, custom_domain: false,
            departments: false, api_access: false, analytics: false,
            audit_logs: false, reports: false, announcements: false,
            priority_support: false,
        },
    },
    {
        code: 'STARTER', name: 'Starter', type: 'STARTER',
        description: 'For growing support teams',
        priceMonthly: 29, priceYearly: 348, currency: 'USD',
        trialDays: 14, sortOrder: 2,
        maxUsers: 10, maxCustomers: 500, maxAgents: 3,
        maxTicketsPerMonth: 5000, maxFeedbackForms: 5,
        maxAttachmentsPerTicket: 10, maxKnowledgeArticles: 50,
        maxInvitations: 25, storageLimitBytes: 5 * GB, apiMonthlyQuota: 25000,
        features: {
            ticket_management: true, knowledge_base: true, feedback: true,
            customer_portal: true, custom_branding: false, custom_domain: false,
            departments: true, api_access: false, analytics: true,
            audit_logs: false, reports: true, announcements: true,
            priority_support: false,
        },
    },
    {
        code: 'PRO', name: 'Pro', type: 'PRO',
        description: 'For scaling customer support operations',
        priceMonthly: 79, priceYearly: 948, currency: 'USD',
        trialDays: 14, sortOrder: 3,
        maxUsers: 50, maxCustomers: 5000, maxAgents: 10,
        maxTicketsPerMonth: 20000, maxFeedbackForms: 15,
        maxAttachmentsPerTicket: 20, maxKnowledgeArticles: 250,
        maxInvitations: 100, storageLimitBytes: 25 * GB, apiMonthlyQuota: 100000,
        features: {
            ticket_management: true, knowledge_base: true, feedback: true,
            customer_portal: true, custom_branding: true, custom_domain: false,
            departments: true, api_access: true, analytics: true,
            audit_logs: true, reports: true, announcements: true,
            priority_support: true,
        },
    },
    {
        code: 'ENTERPRISE', name: 'Enterprise', type: 'ENTERPRISE',
        description: 'For large organizations with advanced requirements',
        priceMonthly: 199, priceYearly: 2388, currency: 'USD',
        trialDays: 14, sortOrder: 4,
        maxUsers: 500, maxCustomers: 100000, maxAgents: 100,
        maxTicketsPerMonth: 100000, maxFeedbackForms: 100,
        maxAttachmentsPerTicket: 50, maxKnowledgeArticles: 2000,
        maxInvitations: 1000, storageLimitBytes: 500 * GB, apiMonthlyQuota: 500000,
        features: {
            ticket_management: true, knowledge_base: true, feedback: true,
            customer_portal: true, custom_branding: true, custom_domain: true,
            departments: true, api_access: true, analytics: true,
            audit_logs: true, reports: true, announcements: true,
            priority_support: true,
        },
    },
];
function planLimits(plan) {
    return {
        maxUsers: plan.maxUsers,
        maxCustomers: plan.maxCustomers,
        maxAgents: plan.maxAgents,
        maxTicketsPerMonth: plan.maxTicketsPerMonth,
        maxFeedbackForms: plan.maxFeedbackForms,
        maxAttachmentsPerTicket: plan.maxAttachmentsPerTicket,
        maxKnowledgeArticles: plan.maxKnowledgeArticles,
        maxInvitations: plan.maxInvitations,
        storageLimitBytes: plan.storageLimitBytes,
        apiMonthlyQuota: plan.apiMonthlyQuota,
    };
}
async function seedSubscriptionPlans() {
    for (const plan of subscriptionPlans) {
        const data = {
            name: plan.name,
            type: plan.type,
            description: plan.description,
            priceMonthly: plan.priceMonthly,
            priceYearly: plan.priceYearly,
            currency: plan.currency,
            trialDays: plan.trialDays,
            sortOrder: plan.sortOrder,
            maxUsers: plan.maxUsers,
            maxCustomers: plan.maxCustomers,
            maxAgents: plan.maxAgents,
            maxTicketsPerMonth: plan.maxTicketsPerMonth,
            maxFeedbackForms: plan.maxFeedbackForms,
            maxAttachmentsPerTicket: plan.maxAttachmentsPerTicket,
            maxKnowledgeArticles: plan.maxKnowledgeArticles,
            maxInvitations: plan.maxInvitations,
            storageLimitBytes: BigInt(plan.storageLimitBytes),
            apiMonthlyQuota: plan.apiMonthlyQuota,
            features: plan.features,
            limits: planLimits(plan),
            isActive: true,
        };
        const existing = await prisma.subscriptionPlan.findUnique({
            where: { code: plan.code },
        });
        if (existing) {
            await prisma.subscriptionPlan.update({ where: { id: existing.id }, data });
        }
        else {
            await prisma.subscriptionPlan.create({ data: { code: plan.code, ...data } });
        }
    }
}
async function seedPermissions() {
    for (const code of PERMISSION_CODES) {
        await prisma.permission.upsert({
            where: { code: code },
            update: {},
            create: { code: code, description: null },
        });
    }
    for (const [role, codes] of Object.entries(ROLE_PERMISSIONS)) {
        for (const code of codes) {
            const permission = await prisma.permission.findUnique({
                where: { code: code },
            });
            if (!permission)
                continue;
            const roleValue = role;
            await prisma.rolePermission.upsert({
                where: {
                    role_permissionId: { role: roleValue, permissionId: permission.id },
                },
                update: {},
                create: { role: roleValue, permissionId: permission.id },
            });
        }
    }
}
async function seedSystemSettings() {
    for (const setting of defaultSystemSettings) {
        await prisma.systemSetting.upsert({
            where: { key: setting.key },
            update: { value: setting.value },
            create: {
                key: setting.key,
                value: setting.value,
                description: setting.description,
            },
        });
    }
}
async function seedFeedbackCategories() {
    const organization = await prisma.organization.upsert({
        where: { slug: 'platform-administration' },
        update: {
            name: 'Platform Administration',
            slug: 'platform-administration',
            tenantKey: 'platform-admin',
            website: 'https://supportflow.local',
            status: 'ACTIVE',
        },
        create: {
            name: 'Platform Administration',
            slug: 'platform-administration',
            tenantKey: 'platform-admin',
            website: 'https://supportflow.local',
            timezone: 'UTC',
            locale: 'en-US',
            status: 'ACTIVE',
        },
    });
    for (const category of defaultFeedbackCategories) {
        const existing = await prisma.feedbackCategory.findFirst({
            where: { name: category.name, organizationId: organization.id },
        });
        if (existing) {
            await prisma.feedbackCategory.update({
                where: { id: existing.id },
                data: { description: category.description },
            });
        }
        else {
            await prisma.feedbackCategory.create({
                data: {
                    name: category.name,
                    description: category.description,
                    organizationId: organization.id,
                },
            });
        }
    }
}
async function main() {
    await seedPlatformAdmin();
    await seedSubscriptionPlans();
    await seedPermissions();
    await seedSystemSettings();
    await seedFeedbackCategories();
    const permissionCount = await prisma.permission.count();
    const planCount = await prisma.subscriptionPlan.count();
    console.log(`Seeded: platform admin, ${planCount} subscription plans, ${permissionCount} permissions, system settings, feedback categories.`);
}
main()
    .catch((error) => {
    console.error('Database seed failed:', error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map