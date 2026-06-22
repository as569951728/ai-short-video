import { VersionStatus } from '../src/generated/prisma/enums.js';
import { disconnectPrismaClient, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { getSeedRecords } from './seed-data.js';

const prisma = getPrismaClient();
const seedRecords = getSeedRecords();

async function main() {
  await prisma.tenant.upsert({
    where: { id: seedRecords.tenant.id },
    update: {
      name: seedRecords.tenant.name,
      slug: seedRecords.tenant.slug,
      isDefault: seedRecords.tenant.isDefault
    },
    create: seedRecords.tenant
  });

  await prisma.user.upsert({
    where: { id: seedRecords.user.id },
    update: {
      tenantId: seedRecords.user.tenantId,
      displayName: seedRecords.user.displayName,
      email: seedRecords.user.email,
      role: seedRecords.user.role
    },
    create: seedRecords.user
  });

  await prisma.policyProfileVersion.upsert({
    where: { id: seedRecords.policyProfileVersion.id },
    update: {
      tenantId: seedRecords.policyProfileVersion.tenantId,
      key: seedRecords.policyProfileVersion.key,
      versionNo: seedRecords.policyProfileVersion.versionNo,
      status: VersionStatus.CURRENT,
      summary: seedRecords.policyProfileVersion.summary,
      configJson: seedRecords.policyProfileVersion.configJson
    },
    create: {
      ...seedRecords.policyProfileVersion,
      status: VersionStatus.CURRENT
    }
  });

  await prisma.promptTemplateVersion.upsert({
    where: { id: seedRecords.promptTemplateVersion.id },
    update: {
      tenantId: seedRecords.promptTemplateVersion.tenantId,
      templateKey: seedRecords.promptTemplateVersion.templateKey,
      versionNo: seedRecords.promptTemplateVersion.versionNo,
      status: VersionStatus.CURRENT,
      summary: seedRecords.promptTemplateVersion.summary,
      inputSchemaJson: seedRecords.promptTemplateVersion.inputSchemaJson,
      outputSchemaJson: seedRecords.promptTemplateVersion.outputSchemaJson
    },
    create: {
      ...seedRecords.promptTemplateVersion,
      status: VersionStatus.CURRENT
    }
  });

  await prisma.modelProvider.upsert({
    where: { id: seedRecords.modelProvider.id },
    update: {
      tenantId: seedRecords.modelProvider.tenantId,
      providerKey: seedRecords.modelProvider.providerKey,
      providerType: seedRecords.modelProvider.providerType,
      displayName: seedRecords.modelProvider.displayName,
      enabled: seedRecords.modelProvider.enabled,
      configSummary: seedRecords.modelProvider.configSummary
    },
    create: seedRecords.modelProvider
  });

  await prisma.modelConfig.upsert({
    where: { id: seedRecords.modelConfig.id },
    update: {
      tenantId: seedRecords.modelConfig.tenantId,
      providerId: seedRecords.modelConfig.providerId,
      modelKey: seedRecords.modelConfig.modelKey,
      displayName: seedRecords.modelConfig.displayName,
      enabled: seedRecords.modelConfig.enabled,
      usageScope: seedRecords.modelConfig.usageScope,
      defaultParamsJson: seedRecords.modelConfig.defaultParamsJson
    },
    create: seedRecords.modelConfig
  });
}

main()
  .then(async () => {
    await disconnectPrismaClient();
  })
  .catch(async (error) => {
    console.error('Seed failed:', error);
    await disconnectPrismaClient();
    process.exit(1);
  });
