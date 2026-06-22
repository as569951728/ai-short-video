export function getSeedRecords() {
  return {
    tenant: {
      id: 'tenant_default',
      name: '默认租户',
      slug: 'default',
      isDefault: true
    },
    user: {
      id: 'user_default',
      tenantId: 'tenant_default',
      displayName: '默认用户',
      email: 'default-user@example.local',
      role: 'owner'
    },
    policyProfileVersion: {
      id: 'policy_default_v1',
      tenantId: 'tenant_default',
      key: 'default_novel_policy',
      versionNo: 1,
      status: 'current',
      summary: '小说首期默认策略：保守审稿阈值、人工确认优先、mock provider 可替换。',
      configJson: {
        reviewStrictness: 'standard',
        contentSafetyStrictness: 'standard',
        originalityStrictness: 'standard',
        rewriteStrength: 'medium',
        marketOrientation: 'medium',
        videoAdaptationPreference: 'medium',
        automationLevel: 'manual_confirm_first'
      }
    },
    promptTemplateVersion: {
      id: 'prompt_novel_direction_v1',
      tenantId: 'tenant_default',
      templateKey: 'novel_direction_generate',
      versionNo: 1,
      status: 'current',
      summary: '生成小说方向候选的默认模板摘要，仅保存用途、输入和输出结构说明。',
      inputSchemaJson: {
        required: ['genres', 'appealPoints', 'targetAudience'],
        optional: ['hotspotOpportunityId', 'customIdea', 'blockedElements']
      },
      outputSchemaJson: {
        candidates: '3-5 个方向候选，包含标题、卖点、风险和推荐理由'
      }
    },
    modelProvider: {
      id: 'provider_mock',
      tenantId: 'tenant_default',
      providerKey: 'mock',
      providerType: 'mock',
      displayName: 'Mock Provider',
      enabled: true,
      configSummary: '本地模拟生成供应商，用于首期接口和任务联调。'
    },
    modelConfig: {
      id: 'model_mock_novel_generator',
      tenantId: 'tenant_default',
      providerId: 'provider_mock',
      modelKey: 'mock-novel-generator',
      displayName: 'Mock Novel Generator',
      enabled: true,
      usageScope: 'novel_generation',
      defaultParamsJson: {
        temperature: 0.7,
        maxOutputUnits: 1200,
        timeoutSeconds: 30
      }
    }
  } as const;
}

export type SeedRecords = ReturnType<typeof getSeedRecords>;
