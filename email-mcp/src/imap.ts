import Imap from "imap";
import { simpleParser, ParsedMail } from 'mailparser';

type ImapConfig = {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
  tlsOptions?: object;
};

export class ImapClient {
  private config: ImapConfig;

  constructor(config: ImapConfig) {
    this.config = config;
  }

  async readEmails(folder: string, noEmails: number): Promise<ParsedMail[]> {
    return new Promise((resolve, reject) => {
      const imap = new Imap(this.config);
      const parsedEmails: ParsedMail[] = [];
      let pendingEmails = 0;

      const checkCompletion = () => {
        pendingEmails--;
        if (pendingEmails === 0) {
          imap.end();
          resolve(parsedEmails);
        }
      };

      imap.once('ready', () => {
        this.openFolder(imap, folder, noEmails, parsedEmails, resolve, reject, () => pendingEmails++, checkCompletion);
      });

      imap.once('error', (err: any) => {
        reject(err);
      });

      imap.connect();
    });
  }

  private openFolder(
    imap: Imap,
    folder: string,
    noEmails: number,
    parsedEmails: ParsedMail[],
    resolve: (value: ParsedMail[]) => void,
    reject: (reason?: any) => void,
    incrementPending: () => void,
    checkCompletion: () => void
  ) {
    imap.openBox(folder.toUpperCase(), false, (err, box) => {
      if (err) {
        reject(err);
        return;
      }
      this.fetchEmails(imap, box, noEmails, parsedEmails, resolve, reject, incrementPending, checkCompletion);
    });
  }

  private fetchEmails(
    imap: Imap,
    box: Imap.Box,
    noEmails: number,
    parsedEmails: ParsedMail[],
    resolve: (value: ParsedMail[]) => void,
    reject: (reason?: any) => void,
    incrementPending: () => void,
    checkCompletion: () => void
  ) {
    imap.search(['UNSEEN'], (err, results) => {
      if (err) {
        reject(err);
        return;
      }
      if (!results || !results.length) {
        console.log('No unread emails found.');
        imap.end();
        resolve([]);
        return;
      }

      const fetch = imap.seq.fetch(
        box.messages.total - noEmails + `:${box.messages.total}`,
        { bodies: '' }
      );

      fetch.on('message', (msg, seqno) => {
        incrementPending();
        msg.on('body', (stream, info) => {
          let buffer = '';
          stream.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
          });
          stream.on('end', async () => {
            try {
              const parsed = await simpleParser(buffer);
              parsedEmails.push(parsed);
            } catch (err) {
              console.error('Error parsing email:', err);
            } finally {
              checkCompletion();
            }
          });
        });
      });

      fetch.once('error', (err) => {
        reject(err);
      });
    });
  }
}