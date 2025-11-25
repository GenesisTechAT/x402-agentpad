/**
 * Dashboard Client
 * 
 * Sends agent updates to the local dashboard server
 */

import axios from 'axios';

export class DashboardClient {
  private dashboardUrl: string;
  private agentId: string;

  constructor(dashboardUrl: string, agentId: string) {
    this.dashboardUrl = dashboardUrl.replace(/\/$/, ''); // Remove trailing slash
    this.agentId = agentId;
  }

  /**
   * Send update to dashboard
   */
  private async send(type: string, data: any = {}): Promise<void> {
    try {
      await axios.post(`${this.dashboardUrl}/agent/update`, {
        agentId: this.agentId,
        type,
        data,
      }, {
        timeout: 2000, // 2 second timeout
      });
    } catch (error) {
      // Silently fail - dashboard is optional
      // console.warn(`[Dashboard] Failed to send update:`, error.message);
    }
  }

  /**
   * Notify dashboard that agent started
   */
  async notifyStart(): Promise<void> {
    await this.send('start');
  }

  /**
   * Notify dashboard that agent stopped
   */
  async notifyStop(): Promise<void> {
    await this.send('stop');
  }

  /**
   * Notify dashboard of execution result
   */
  async notifyExecution(result: any): Promise<void> {
    await this.send('execution', result);
  }

  /**
   * Notify dashboard of error
   */
  async notifyError(error: Error): Promise<void> {
    await this.send('error', {
      error: error.message,
      stack: error.stack,
    });
  }
}

