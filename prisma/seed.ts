import { PrismaClient } from '@prisma/client-consumer';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_CONSUMER_URL,
    },
  },
});

async function main() {
  const templateName = 'tenant_app_download';
  const displayName = 'Tenant App Download';
  const metaTemplateName = '1610601234193277';

  const existing = await prisma.whatsapp_templates.findUnique({
    where: { name: templateName },
  });

  if (existing) {
    await prisma.whatsapp_templates.update({
      where: { s_no: existing.s_no },
      data: {
        display_name: displayName,
        meta_template_name: metaTemplateName,
        body: `Hello {{recipient_name}},\n\nYou have been added as a tenant at {{pg_name}}.\n\nPlease install and log in to the PG Management app to view your payment details, rent status, and complaints.\n\nThank you.`,
        channel: 'WHATSAPP',
        recipient_types: ['TENANT'],
        is_system: true,
        lifecycle_status: 'ACTIVE',
        language: 'en_US',
        category: 'UTILITY',
      },
    });
    console.log(`Updated template: ${templateName}`);
  } else {
    await prisma.whatsapp_templates.create({
      data: {
        name: templateName,
        display_name: displayName,
        meta_template_name: metaTemplateName,
        body: `Hello {{recipient_name}},\n\nYou have been added as a tenant at {{pg_name}}.\n\nPlease install and log in to the PG Management app to view your payment details, rent status, and complaints.\n\nThank you.`,
        channel: 'WHATSAPP',
        recipient_types: ['TENANT'],
        is_system: true,
        lifecycle_status: 'ACTIVE',
        language: 'en_US',
        category: 'UTILITY',
      } as any,
    });
    console.log(`Created template: ${templateName}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
