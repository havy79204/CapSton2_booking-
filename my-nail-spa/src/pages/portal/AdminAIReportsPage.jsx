import { Bot, TrendingUp } from 'lucide-react'
import { useI18n } from '../../context/I18nContext.jsx'

export function AdminAIReportsPage() {
  const { t } = useI18n()
  return (
    <>
      <div className="sectionHeader" style={{ marginBottom: 14 }}>
        <h2>{t('portal.adminAI.title', 'AI Reports')}</h2>
        <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          <Bot size={16} />
          {t('portal.adminAI.subtitle', 'Analytics & strategy insights (demo)')}
        </div>
      </div>

      <div className="portalGrid">
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div className="badge"><TrendingUp size={14} /></div>
            <div style={{ fontWeight: 900 }}>{t('portal.adminAI.demand', 'Demand Forecast')}</div>
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {t('portal.adminAI.demandHint', 'Predict booking demand by region, service type, and seasonality.')}
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>{t('portal.adminAI.inventory', 'Inventory Optimization')}</div>
          <div className="muted" style={{ fontSize: 13 }}>{t('portal.adminAI.inventoryHint', 'Recommend reorder points for consumables + retail per salon.')}</div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>{t('portal.adminAI.alerts', 'Operational Alerts')}</div>
          <div className="muted" style={{ fontSize: 13 }}>{t('portal.adminAI.alertsHint', 'Identify schedule gaps, overbook risk, and service bottlenecks.')}</div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>{t('portal.adminAI.next', 'Next Best Actions')}</div>
          <div className="muted" style={{ fontSize: 13 }}>{t('portal.adminAI.nextHint', 'Suggest promotions, staffing changes, and supply purchases.')}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 14, marginTop: 14 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>{t('portal.adminAI.noteTitle', 'Note')}</div>
        <div className="muted" style={{ fontSize: 13 }}>{t('portal.adminAI.note', 'This FE prototype shows the intended workflow. In production, these panels would be backed by data pipelines and LLM/ML services.')}</div>
      </div>
    </>
  )
}
