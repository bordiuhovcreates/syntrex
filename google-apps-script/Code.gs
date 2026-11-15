/**
 * Приймач заявок з сайту: записує заявку в Google-таблицю, надсилає її на email
 * і (якщо налаштовано) в Telegram.
 *
 * Як встановити:
 * 1. Google-таблиця → Розширення → Apps Script → вставити цей код у Code.gs → зберегти.
 * 2. Виконати testEmail → дозволити доступ (Gmail) → на NOTIFY_EMAIL прийде тестовий лист.
 * 3. (Необов'язково) Telegram: Налаштування проєкту → Властивості скрипта:
 *      TELEGRAM_TOKEN   — токен бота від @BotFather
 *      TELEGRAM_CHAT_ID — ID групи для заявок (з мінусом)
 *    і виконати testTelegram.
 * 4. Розгорнути → Нове розгортання → Веб-застосунок, від імені «Я», доступ «Усі».
 * 5. URL веб-застосунку (/exec) вписати в FORM_ENDPOINT у файлі site.config.mjs.
 *
 * Після кожної зміни коду: Розгорнути → Керувати розгортаннями → олівець →
 * Нова версія. І збільшити VERSION нижче, щоб перевірити, що оновлення спрацювало.
 */

var VERSION = 2;
var SHEET_NAME = 'Заявки';
var HEADERS = ['Дата', "Ім'я", 'Прізвище', 'Телефон', 'Email', 'Компанія', 'Повідомлення', 'Форма'];

// Куди надсилати заявки. Можна перевизначити властивістю скрипта NOTIFY_EMAIL.
var NOTIFY_EMAIL = 'vladlenbordugov@gmail.com';

function doPost(e) {
  try {
    var data = {};
    try {
      data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (parseError) {
      return json_({ ok: false, error: 'Невірний формат даних' });
    }

    // Поле-пастка: людина його не бачить, а бот заповнює
    if (data.website) {
      return json_({ ok: true });
    }

    var lead = {
      name: clean_(data.name),
      lastName: clean_(data.lastName),
      phone: clean_(data.phone),
      email: clean_(data.email),
      company: clean_(data.company),
      message: clean_(data.message, 3000),
      service: clean_(data.service) || 'Заявка з сайту',
    };

    var isNewsletter = lead.service === 'Newsletter'; // підписка у футері: лише email
    if (!isNewsletter && (!lead.name || !lead.phone)) {
      return json_({ ok: false, error: "Вкажіть ім'я і телефон" });
    }
    if ((isNewsletter || lead.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email)) {
      return json_({ ok: false, error: 'Невірний email' });
    }

    // 1. Спочатку таблиця: заявка збережеться, навіть якщо пошта чи Telegram недоступні
    saveToSheet_(lead);

    var text = format_(lead);

    // 2. Email
    try {
      sendEmail_(lead, text);
    } catch (mailError) {
      console.error('Email: ' + mailError);
    }

    // 3. Telegram (якщо налаштовано)
    try {
      sendTelegram_('🔔 Нова заявка\n\n' + text);
    } catch (tgError) {
      console.error('Telegram: ' + tgError);
    }

    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'Помилка сервера' });
  }
}

// Відкрийте URL /exec в інкогніто — побачите номер версії
function doGet() {
  return json_({ ok: true, version: VERSION });
}

// Перевірка пошти прямо з редактора: оберіть testEmail → Виконати
function testEmail() {
  sendEmail_({ name: 'Тест', service: 'Перевірка' }, '✅ Тест: заявки з сайту приходитимуть на цю пошту.');
}

// Перевірка бота прямо з редактора: оберіть testTelegram → Виконати
function testTelegram() {
  sendTelegram_('✅ Тест: бот підключений, заявки приходитимуть сюди.');
}

function clean_(value, max) {
  return String(value || '').trim().slice(0, max || 300);
}

function format_(lead) {
  if (lead.service === 'Newsletter') return 'Нова підписка на розсилку\nEmail: ' + lead.email;
  var lines = [
    "Ім'я: " + lead.name + (lead.lastName ? ' ' + lead.lastName : ''),
    'Телефон: ' + lead.phone,
  ];
  if (lead.email) lines.push('Email: ' + lead.email);
  if (lead.company) lines.push('Компанія: ' + lead.company);
  if (lead.message) lines.push('Повідомлення:\n' + lead.message);
  lines.push('Форма: ' + lead.service);
  return lines.join('\n');
}

function saveToSheet_(lead) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([new Date(), lead.name, lead.lastName, lead.phone, lead.email, lead.company, lead.message, lead.service]);
}

function sendEmail_(lead, text) {
  var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || NOTIFY_EMAIL;
  var options = { name: 'Syntrex — сайт' };
  // «Відповісти» в листі одразу пише клієнту
  if (lead.email) options.replyTo = lead.email;
  var subject = lead.service === 'Newsletter'
    ? 'Нова підписка на розсилку: ' + lead.email
    : 'Нова заявка з сайту: ' + lead.name + ' (' + lead.service + ')';
  MailApp.sendEmail(to, subject, text, options);
}

function sendTelegram_(text) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_TOKEN');
  var chatId = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return; // Telegram не налаштовано — пропускаємо
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: text }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Telegram відповів ' + res.getResponseCode() + ': ' + res.getContentText());
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
