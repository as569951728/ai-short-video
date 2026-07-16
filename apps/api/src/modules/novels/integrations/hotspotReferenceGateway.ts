export interface HotspotReferenceCapability {
  available: boolean;
  unavailableReason: string | null;
}

export interface HotspotReferenceValidationInput {
  tenantId: string;
  reportId: string;
  opportunityId: string | null;
}

export interface HotspotReferenceValidationResult {
  ok: boolean;
  reasonCode: 'missing_report' | 'cross_tenant' | 'opportunity_not_in_report' | 'not_referencable' | 'capability_unavailable' | null;
  message: string | null;
  report: {
    id: string;
    title: string | null;
  } | null;
  opportunity: {
    id: string;
    title: string | null;
  } | null;
}

export interface HotspotReferenceGateway {
  getCapability(tenantId: string): Promise<HotspotReferenceCapability>;
  validateReference(input: HotspotReferenceValidationInput): Promise<HotspotReferenceValidationResult>;
}

export class UnavailableHotspotReferenceGateway implements HotspotReferenceGateway {
  async getCapability(): Promise<HotspotReferenceCapability> {
    return {
      available: false,
      unavailableReason: '当前尚未接入真实热点查询，引用热点暂不可用。'
    };
  }

  async validateReference(): Promise<HotspotReferenceValidationResult> {
    return {
      ok: false,
      reasonCode: 'capability_unavailable',
      message: '当前尚未接入真实热点查询，不能引用热点创建小说。',
      report: null,
      opportunity: null
    };
  }
}
