// The Ivy Arc contact form -> Google Sheet.
// Paste into Extensions > Apps Script of the Google Sheet that should collect inquiries,
// then deploy as a web app (Execute as: Me, Who has access: Anyone). See README.md.

const SHEET_NAME = 'Inquiries';
const EMAIL_NOTIFICATIONS = true; // Emails the sheet owner for every new inquiry.
const MAX_PER_HOUR = 30; // Best-effort cap across all visitors, so a flood can't fill the sheet or inbox.

const EMAIL_PATTERN = /^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function doPost(e) {
  let data;
  try { data = JSON.parse(e.postData.contents); } catch (error) { return reply({ok: false, code: 'validation'}); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return reply({ok: false, code: 'validation'});
  const {name, email, message, website, submissionId} = data;
  if (website || typeof name !== 'string' || name.trim().length < 1 || name.length > 100 || /[\r\n\x00-\x1f]/.test(name) ||
      typeof email !== 'string' || email.length > 254 || !EMAIL_PATTERN.test(email.trim()) ||
      typeof message !== 'string' || message.trim().length < 10 || message.length > 5000 ||
      typeof submissionId !== 'string' || !ID_PATTERN.test(submissionId)) return reply({ok: false, code: 'validation'});

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const cache = CacheService.getScriptCache();
    // A retry of the same submission (e.g. after a timeout) should not add a second row.
    if (cache.get('id:' + submissionId)) return reply({ok: true});
    const hour = 'count:' + Math.floor(Date.now() / 3600000);
    const count = Number(cache.get(hour) || 0);
    if (count >= MAX_PER_HOUR) return reply({ok: false, code: 'rate'});

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAME);
      sheet.appendRow(['Received', 'Name', 'Email', 'Message']);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([new Date(), asText(name.trim()), asText(email.trim()), asText(message.trim())]);
    cache.put('id:' + submissionId, '1', 21600);
    cache.put(hour, String(count + 1), 3600);

    if (EMAIL_NOTIFICATIONS) {
      try {
        MailApp.sendEmail({
          to: Session.getEffectiveUser().getEmail(),
          replyTo: email.trim(),
          subject: 'New inquiry from theivyarc.com',
          body: `Name: ${name.trim()}\nEmail: ${email.trim()}\n\nMessage:\n${message.trim()}\n\nAll inquiries: ${spreadsheet.getUrl()}`
        });
      } catch (error) {} // The row is saved; a failed notification should not report failure to the visitor.
    }
    return reply({ok: true});
  } catch (error) {
    return reply({ok: false, code: 'delivery'});
  } finally {
    lock.releaseLock();
  }
}

// Visitor text must never run as a spreadsheet formula (e.g. "=IMPORTXML(...)"), so force it to plain text.
function asText(value) {
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}

function reply(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
