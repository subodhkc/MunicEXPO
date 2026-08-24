/**
 * E1 A16 — Assurance Evaluation QStash Enqueue
 *
 * Connects Assurance execution to the normal pipeline lifecycle.
 *
 * Flow:
 *   orchestrator → U4 QStash aggregate → U4 completes
 *   → await durable enqueue of Assurance evaluation
 *   → separate QStash Assurance endpoint
 *   → methodology 1.1 evaluation
 *   → persistence
 *
 * Reuses existing QStash infrastructure from lib/decision-pipeline/enqueue.ts.
 * Does NOT create another queue system.
 *
 * U4 remains complete if Assurance computation itself later fails.
 * But the durable handoff must be observable/retryable.
 */

import { Client } from '@upstash/qstash'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.haiec.com'

let qstashClient: Client | null = null

function getQstashClient(): Client | null {
  if (!process.env.QSTASH_TOKEN) return null
  if (!qstashClient) {
    qstashClient = new Client({ token: process.env.QSTASH_TOKEN })
  }
  return qstashClient
}

/**
 * Enqueue an Assurance evaluation job for a completed pipeline aggregation.
 *
 * Called after runPipelineAggregation() completes successfully.
 * Safe to call multiple times — the Assurance evaluation is idempotent.
 * If QStash is not configured, logs a warning and returns (dev/test fallback).
 */
export async function enqueueAssuranceEvaluation(
  orchestratorRunId: string,
  pipelineAggregationId: string
): Promise<void> {
  const client = getQstashClient()

  if (!client) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[assurance/enqueue] QSTASH_TOKEN not configured — assurance evaluation skipped for run:',
        orchestratorRunId
      )
    } else {
      console.log(
        '[assurance/enqueue] DEV: assurance evaluation would be enqueued for run:',
        orchestratorRunId
      )
    }
    return
  }

  try {
    await client.publishJSON({
      url: `${SITE_URL}/api/assurance/evaluate`,
      body: { orchestratorRunId, pipelineAggregationId },
      retries: 3,
      // 5-second delay to ensure DB writes from aggregation are committed
      delay: 5,
    })

    console.log('[assurance/enqueue] Enqueued assurance evaluation for run:', orchestratorRunId)
  } catch (error) {
    // Non-fatal — U4 aggregation is already complete.
    // Assurance evaluation can be triggered manually via backfill.
    console.error('[assurance/enqueue] Failed to enqueue assurance evaluation:', error)
  }
}
