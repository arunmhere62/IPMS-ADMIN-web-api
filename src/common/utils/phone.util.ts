const DEFAULT_COUNTRY_CODE = '91'

// Common country codes (length 1-3 digits) used to detect international numbers
// when the user did not add an explicit +. This is a conservative list.
const KNOWN_COUNTRY_CODES = new Set([
  '1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47',
  '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66',
  '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98', '211', '212', '213', '216', '218',
  '220', '221', '222', '223', '224', '225', '226', '227', '228', '229', '230', '231', '232', '233',
  '234', '235', '236', '237', '238', '239', '240', '241', '242', '243', '244', '245', '246', '248',
  '249', '250', '251', '252', '253', '254', '255', '256', '257', '258', '260', '261', '262', '263',
  '264', '265', '266', '267', '268', '269', '290', '291', '297', '298', '299', '350', '351', '352',
  '353', '354', '355', '356', '357', '358', '359', '370', '371', '372', '373', '374', '375', '376',
  '377', '378', '379', '380', '381', '382', '383', '385', '386', '387', '389', '420', '421', '423',
  '500', '501', '502', '503', '504', '505', '506', '507', '508', '509', '590', '591', '592', '593',
  '594', '595', '596', '597', '598', '599', '670', '672', '673', '674', '675', '676', '677', '678',
  '679', '680', '681', '682', '683', '685', '686', '687', '688', '689', '690', '691', '692', '850',
  '852', '853', '855', '856', '880', '886', '960', '961', '962', '963', '964', '965', '966', '967',
  '968', '970', '971', '972', '973', '974', '975', '976', '977', '992', '993', '994', '995', '996',
  '998',
])

function hasCountryCode(digits: string): boolean {
  for (let i = 1; i <= 3 && i <= digits.length; i++) {
    if (KNOWN_COUNTRY_CODES.has(digits.slice(0, i))) {
      return true
    }
  }
  return false
}

/**
 * Normalize a raw phone/number string to E.164 format.
 * Returns null for empty/invalid input.
 * Default country is India (91).
 * Handles Indian mobile and landline numbers, with or without leading 0/91.
 */
export function toE164(raw: unknown, defaultCountryCode = DEFAULT_COUNTRY_CODE): string | null {
  if (raw === undefined || raw === null) return null

  const str = String(raw).trim()
  if (!str) return null

  const hasPlus = str.startsWith('+')
  const digits = str.replace(/\D/g, '')
  if (!digits) return null

  // Explicit international number, keep as-is
  if (hasPlus) {
    return `+${digits}`
  }

  // Too short or too long to be a valid phone number
  if (digits.length < 7 || digits.length > 15) {
    return null
  }

  // Leading 0 is the Indian trunk prefix (STD code): 08012345678 -> +918012345678
  if (digits.startsWith('0')) {
    const stripped = digits.slice(1)
    if (stripped.length < 7 || stripped.length > 14) return null
    return `+${defaultCountryCode}${stripped}`
  }

  // 10-digit number without country code: mobile or landline
  if (digits.length === 10) {
    return `+${defaultCountryCode}${digits}`
  }

  // 11-15 digits that already start with a known country code: keep as-is
  if (hasCountryCode(digits)) {
    return `+${digits}`
  }

  // 11-15 digits without a recognized country code: assume India and prepend country code
  return `+${defaultCountryCode}${digits}`
}

/**
 * Format an E.164 number for display.
 * Indian mobile: +91900011008 -> +91 90001 10008
 * Indian landline: +918012345678 -> +91 80 1234 5678
 */
export function formatE164(e164: string | null | undefined): string {
  if (!e164) return ''
  const digits = e164.replace(/\D/g, '')

  if (!digits.startsWith('91')) return e164

  const ccLen = 2 // '91'
  const national = digits.slice(ccLen)

  // 12 digits total => 91 + 10 digit national number
  if (digits.length === 12) {
    const firstDigit = national.charAt(0)
    if (firstDigit >= '6' && firstDigit <= '9') {
      // Mobile: 91 5XXXX XXXXX (or 4/5 depending on length)
      return `+91 ${national.slice(0, 5)} ${national.slice(5)}`
    }
    // Landline with 2-digit area code: 91 80 1234 5678
    return `+91 ${national.slice(0, 2)} ${national.slice(2, 6)} ${national.slice(6)}`
  }

  // 13 digits total => 91 + 11 digit national (3-digit area code or mobile)
  if (digits.length === 13) {
    const firstDigit = national.charAt(0)
    if (firstDigit >= '6' && firstDigit <= '9') {
      return `+91 ${national.slice(0, 5)} ${national.slice(5)}`
    }
    // 3-digit area code: 91 22X XXXX XXXX
    return `+91 ${national.slice(0, 3)} ${national.slice(3, 7)} ${national.slice(7)}`
  }

  // 14 digits total => 91 + 12 digit national (3/4-digit area code)
  if (digits.length === 14) {
    const firstDigit = national.charAt(0)
    if (firstDigit >= '6' && firstDigit <= '9') {
      return `+91 ${national.slice(0, 5)} ${national.slice(5)}`
    }
    return `+91 ${national.slice(0, 4)} ${national.slice(4, 8)} ${national.slice(8)}`
  }

  return e164
}
