import {
  toJalaali,
  toGregorian,
  isValidJalaaliDate,
  isValidGregorianDate
} from "jalaali-js";

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function digits(value) {
  return String(value ?? "").replace(/[۰-۹٠-٩]/g, c => {
    const fa = "۰۱۲۳۴۵۶۷۸۹".indexOf(c);
    return String(fa >= 0 ? fa : "٠١٢٣٤٥٦٧٨٩".indexOf(c));
  });
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function validNationalCode(value) {
  const s = digits(value).replace(/\D/g, "");
  if (!/^\d{10}$/.test(s) || /^(\d)\1{9}$/.test(s)) return false;

  const sum = [...s.slice(0, 9)]
    .reduce((total, digit, i) => total + Number(digit) * (10 - i), 0);

  const remainder = sum % 11;
  const check = Number(s[9]);

  return remainder < 2 ? check === remainder : check === 11 - remainder;
}

function validCard(value) {
  const s = digits(value).replace(/[\s-]/g, "");
  if (!/^\d{16}$/.test(s)) return false;

  let sum = 0;

  for (let i = 0; i < s.length; i++) {
    let n = Number(s[i]);

    if (i % 2 === 0) {
      n *= 2;
      if (n > 9) n -= 9;
    }

    sum += n;
  }

  return sum % 10 === 0;
}

function validSheba(value) {
  const s = digits(value).toUpperCase().replace(/[\s-]/g, "");
  if (!/^IR\d{24}$/.test(s)) return false;

  const rearranged = s.slice(4) + "1827" + s.slice(2, 4);
  let remainder = 0;

  for (const char of rearranged) {
    remainder = (remainder * 10 + Number(char)) % 97;
  }

  return remainder === 1;
}

const ones = [
  "صفر", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه",
  "ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده",
  "هفده", "هجده", "نوزده"
];

const tens = [
  "", "", "بیست", "سی", "چهل", "پنجاه",
  "شصت", "هفتاد", "هشتاد", "نود"
];

const hundreds = [
  "", "یکصد", "دویست", "سیصد", "چهارصد",
  "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد"
];

const scales = [
  "", "هزار", "میلیون", "میلیارد",
  "تریلیون", "کوادریلیون", "کوینتیلیون"
];

function under1000(n) {
  const result = [];

  if (n >= 100) {
    result.push(hundreds[Math.floor(n / 100)]);
    n %= 100;
  }

  if (n >= 20) {
    result.push(tens[Math.floor(n / 10)]);
    n %= 10;
  }

  if (n > 0) result.push(ones[n]);

  return result;
}

function numberWords(value) {
  const raw = digits(value).trim();

  if (!/^-?\d+$/.test(raw)) {
    throw new Error("عدد باید یک عدد صحیح باشد.");
  }

  let n = BigInt(raw);

  if (n < 0n) return "منفی " + numberWords((-n).toString());
  if (n === 0n) return "صفر";

  if (n > 999999999999999999999n) {
    throw new Error("عدد بیش از حد مجاز است.");
  }

  const parts = [];
  let index = 0;

  while (n > 0n) {
    const group = Number(n % 1000n);
    n /= 1000n;

    if (group) {
      const words = under1000(group).join(" و ");
      parts.unshift(words + (scales[index] ? " " + scales[index] : ""));
    }

    index++;
  }

  return parts.join(" و ");
}

function bankFromBin(card) {
  const bins = {
    "603799": "بانک ملی ایران",
    "589210": "بانک سپه",
    "627648": "بانک توسعه صادرات ایران",
    "627961": "بانک صنعت و معدن",
    "603770": "بانک کشاورزی",
    "628023": "بانک مسکن",
    "627760": "پست بانک ایران",
    "502908": "بانک توسعه تعاون",
    "627412": "بانک اقتصاد نوین",
    "622106": "بانک پارسیان",
    "502229": "بانک پاسارگاد",
    "627488": "بانک کارآفرین",
    "621986": "بانک سامان",
    "639607": "بانک سرمایه",
    "636214": "بانک آینده",
    "502938": "بانک دی",
    "610433": "بانک ملت",
    "627353": "بانک تجارت",
    "585983": "بانک تجارت",
    "639346": "بانک سینا",
    "606256": "مؤسسه اعتباری ملل"
  };

  return bins[card.slice(0, 6)] || null;
}

function responseError(code, message, status = 400) {
  return json({ ok: false, error: { code, message } }, status, cors);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/" || url.pathname === "/api/v1/health") {
      return json({
        ok: true,
        service: "Mirzaei API",
        version: "1.0.0",
        timestamp: new Date().toISOString()
      }, 200, cors);
    }

    const match = url.pathname.match(
      /^\/api\/v1\/(date|number|national-code|card|sheba|text)$/
    );

    if (!match) {
      return responseError("not_found", "این مسیر API وجود ندارد.", 404);
    }

    if (!["GET", "POST"].includes(request.method)) {
      return responseError("method_not_allowed", "متد پشتیبانی نمی‌شود.", 405);
    }

    let body = {};

    if (request.method === "POST") {
      try {
        body = await request.json();
      } catch {
        return responseError("invalid_json", "بدنه درخواست باید JSON معتبر باشد.");
      }
    }

    const endpoint = match[1];

    try {
      let data;

      switch (endpoint) {
        case "date": {
          const date = String(url.searchParams.get("date") || body.date || "");
          const jalali = String(url.searchParams.get("jalali") || body.jalali || "");

          if (date) {
            const m = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
            if (!m) return responseError("invalid_date", "فرمت تاریخ میلادی YYYY-MM-DD است.");

            const [y, mo, d] = m.slice(1).map(Number);
            if (!isValidGregorianDate(y, mo, d)) {
              return responseError("invalid_date", "تاریخ میلادی معتبر نیست.");
            }

            const j = toJalaali(y, mo, d);
            data = {
              gregorian: date,
              jalali: `${j.jy}-${String(j.jm).padStart(2, "0")}-${String(j.jd).padStart(2, "0")}`
            };
          } else if (jalali) {
            const m = jalali.match(/^(\d{3,4})-(\d{1,2})-(\d{1,2})$/);
            if (!m) return responseError("invalid_date", "فرمت تاریخ شمسی YYYY-MM-DD است.");

            const [y, mo, d] = m.slice(1).map(Number);
            if (!isValidJalaaliDate(y, mo, d)) {
              return responseError("invalid_date", "تاریخ شمسی معتبر نیست.");
            }

            const g = toGregorian(y, mo, d);
            data = {
              jalali,
              gregorian: `${g.gy}-${String(g.gm).padStart(2, "0")}-${String(g.gd).padStart(2, "0")}`
            };
          } else {
            return responseError("missing_date", "date یا jalali را ارسال کن.");
          }

          break;
        }

        case "number":
          if (body.number === undefined) {
            return responseError("missing_number", 'نمونه: {"number":123}');
          }

          data = {
            number: String(body.number),
            words_fa: numberWords(body.number)
          };
          break;

        case "national-code": {
          const code = digits(body.code ?? url.searchParams.get("code") ?? "").replace(/\D/g, "");
          if (!code) return responseError("missing_code", "کد ملی را ارسال کن.");

          data = {
            code,
            valid: validNationalCode(code),
            note: "این بررسی فقط ساختار و رقم کنترل را می‌سنجد؛ هویت فرد تأیید نمی‌شود."
          };
          break;
        }

        case "card": {
          const card = digits(body.card ?? url.searchParams.get("card") ?? "")
            .replace(/[\s-]/g, "");

          if (!card) return responseError("missing_card", "شماره کارت را ارسال کن.");

          data = {
            valid: validCard(card),
            bank: /^\d{16}$/.test(card) ? bankFromBin(card) : null,
            note: "این بررسی فعال بودن کارت یا مالکیت آن را تأیید نمی‌کند."
          };
          break;
        }

        case "sheba": {
          const iban = digits(body.iban ?? url.searchParams.get("iban") ?? "")
            .toUpperCase().replace(/[\s-]/g, "");

          if (!iban) return responseError("missing_iban", "شماره شبا را ارسال کن.");

          data = {
            iban,
            valid: validSheba(iban),
            note: "این بررسی مالکیت یا فعال بودن حساب را تأیید نمی‌کند."
          };
          break;
        }

        case "text":
          if (typeof body.text !== "string") {
            return responseError("missing_text", 'نمونه: {"text":"متن شما"}');
          }

          data = {
            original: body.text,
            normalized: normalizeText(body.text)
          };
          break;
      }

      return json({
        ok: true,
        data,
        meta: {
          endpoint: `/api/v1/${endpoint}`,
          version: "1.0.0"
        }
      }, 200, cors);

    } catch (error) {
      return responseError(
        "invalid_input",
        error instanceof Error ? error.message : "ورودی نامعتبر است."
      );
    }
  }
};