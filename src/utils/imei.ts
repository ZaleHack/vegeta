export const computeImeiCheckDigit = (baseImei: string): number => {
  const digits = baseImei.replace(/\D/g, '');
  if (digits.length !== 14) {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    const digit = Number(digits[index]);
    if (Number.isNaN(digit)) {
      return 0;
    }

    const isEvenPosition = (index + 1) % 2 === 0;
    if (isEvenPosition) {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    } else {
      sum += digit;
    }
  }

  return (10 - (sum % 10)) % 10;
};

export const normalizeImeiWithCheckDigit = (imei: string): string => {
  const digits = imei.replace(/\D/g, '');
  if (digits.length < 14) {
    return imei;
  }

  const base = digits.slice(0, 14);
  const checkDigit = computeImeiCheckDigit(base);
  return `${base}${checkDigit}`;
};
