import axios from 'axios';

interface EtherpadPad {
  padID: string;
}

interface EtherpadAuthor {
  authorID: string;
}

interface EtherpadSession {
  sessionID: string;
}

export class EtherpadService {
  private client: ReturnType<typeof axios.create>;

  constructor() {
    const baseURL = process.env.ETHERPAD_URL || 'http://localhost:9001';
    const apiKey = process.env.ETHERPAD_API_KEY || '';

    this.client = axios.create({
      baseURL: `${baseURL}/api/1.2.1/`,
      params: { apikey: apiKey },
      timeout: 10000,
    });
  }

  /**
   * Create a new pad with initial content
   */
  async createPad(padID: string, text: string): Promise<void> {
    await this.client.post('createPad', { padID, text });
  }

  /**
   * Set the text content of a pad
   */
  async setText(padID: string, text: string): Promise<void> {
    await this.client.post('setText', { padID, text });
  }

  /**
   * Get the text content of a pad
   */
  async getText(padID: string): Promise<string> {
    const response = await this.client.post('getText', { padID });
    return response.data.data.text;
  }

  /**
   * Get the HTML content of a pad
   */
  async getHTML(padID: string): Promise<string> {
    const response = await this.client.post('getHTML', { padID });
    return response.data.data.html;
  }

  /**
   * Create an author (for attribution)
   */
  async createAuthor(name: string): Promise<string> {
    const response = await this.client.post('createAuthor', { name });
    return response.data.data.authorID;
  }

  /**
   * Create a session for an author on a pad
   */
  async createSession(
    groupID: string,
    authorID: string,
    validUntil: number
  ): Promise<string> {
    const response = await this.client.post('createSession', {
      groupID,
      authorID,
      validUntil,
    });
    return response.data.data.sessionID;
  }

  /**
   * Delete a pad
   */
  async deletePad(padID: string): Promise<void> {
    await this.client.post('deletePad', { padID });
  }

  /**
   * List all pads
   */
  async listAllPads(): Promise<string[]> {
    const response = await this.client.post('listAllPads');
    return response.data.data.padIDs;
  }

  /**
   * Get pad revision count
   */
  async getRevisionsCount(padID: string): Promise<number> {
    const response = await this.client.post('getRevisionsCount', { padID });
    return response.data.data.revisions;
  }

  /**
   * Export pad as PDF (requires abiword/soffice installed in Etherpad container)
   */
  async exportAsPDF(padID: string): Promise<Buffer> {
    const baseURL = process.env.ETHERPAD_URL || 'http://localhost:9001';
    const apiKey = process.env.ETHERPAD_API_KEY || '';
    const response = await axios.get(`${baseURL}/p/${padID}/export/pdf`, {
      params: { apikey: apiKey },
      responseType: 'arraybuffer',
      timeout: 30000,
    });
    return Buffer.from(response.data);
  }

  /**
   * Check if Etherpad is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const baseURL = process.env.ETHERPAD_URL || 'http://localhost:9001';
      await axios.get(`${baseURL}/health`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

export const etherpadService = new EtherpadService();