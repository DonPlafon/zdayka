export const workTypes = [
  "Курсова", "Кваліфікаційна / дипломна", "Лабораторна", "Розрахунки й задачі", "Перевірка й доопрацювання", "Інше"
] as const;

export const subjects = [
  "Економіка", "Фінанси", "Психологія", "Математика", "Програмування", "Бази даних", "Інше"
] as const;

export const statusLabels: Record<string, string> = {
  received: "Заявку отримано", needs_info: "Уточнюємо", awaiting_payment: "Очікуємо оплату",
  working: "Виконуємо", ready: "Результат готовий", closed: "Закрито", cancelled: "Скасовано"
};

export const money = (cents: number) => `${new Intl.NumberFormat("uk-UA").format(cents / 100)} грн`;
export const dateLabel = (value?: string | null) => value ? new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : "—";
