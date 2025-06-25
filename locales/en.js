// locales/en.js (Diperbaiki & Dilengkapi)
module.exports = {
    GREETING: "Hello {userName}! 👋\n\nI am DuitQ, 🤖 your personal finance recording bot. Type *help* to see all the commands I can do.",
    HELP_TEXT: (userName, incomeCategories, expenseCategories) => `Hello ${userName}! 👋 Here is a list of commands you can use:\n\n` +
        `*1. Record a Transaction* 📝\n` + `Use the format: \`category amount [note]\`\n` + `Example: \`food 15000 lunch\`\n\n` +
        `*2. Check Financial Report* 📈\n` + `Use the format: \`check [period]\`\n` + `Example: \`check daily\`\n` + `Periods: *daily, weekly, monthly, yearly*\n\n` +
        `*3. Edit Last Transaction* ✏️\n` + `Type: \`edit\` or \`change\`\n\n` +
        `*4. Set Language* 🌐\n` + `Type: \`set lang en\` or \`set lang id\`\n\n` +
        `---\n\n` + `*INCOME CATEGORIES* 📥\n${incomeCategories}\n\n` + `*EXPENSE CATEGORIES* 📤\n${expenseCategories}`,
    TRANSACTION_SUCCESS: (tipeText, kategoriNama, nominal, catatan) => `✅ *Transaction Recorded Successfully!*\n\n` + `*Type:* ${tipeText}\n` + `*Category:* ${kategoriNama}\n` + `*Amount:* ${nominal}\n` + `*Note:* ${catatan || '-'}`,
    EDIT_SUCCESS: "✅ Transaction successfully updated!",
    EDIT_START: (kategori, nominal, catatan) => `Last transaction to be edited:\n\n` + `*Category:* ${kategori}\n` + `*Amount:* ${nominal}\n` + `*Note:* ${catatan || '-'}\n\n` + `What do you want to change?\n` + `1. Amount\n` + `2. Note\n` + `3. Both\n\n` + `Send your choice number (1/2/3). Type *cancel* to cancel.`,
    EDIT_NO_TX: "No last transaction found to edit. 🤔",
    REPORT_TITLE: "📊 *Financial Report for {period}*",
    REPORT_SUMMARY: (totalIncome, totalExpense, finalBalance) => `📥 *Total Income:*\n   ${totalIncome}\n\n` + `📤 *Total Expense:*\n   ${totalExpense}\n\n` + `--------------------\n` + `✨ *Final Balance:*\n   *${finalBalance}*\n` + `--------------------\n`,
    REPORT_NO_TX: "No transactions recorded for this {period}. 😊",
    REPORT_INCOME_DETAILS: "*INCOME DETAILS* 📥",
    REPORT_EXPENSE_DETAILS: "*EXPENSE DETAILS* 📤",
    LANGUAGE_SET: "Language successfully changed to English. 🇬🇧",
    // Errors and validations
    ERROR_UNKNOWN_COMMAND: "🤔 Command not recognized. Type *help* to see the command list.",
    ERROR_INVALID_NOMINAL: "❌ Amount must be a number.",
    ERROR_CATEGORY_NOT_FOUND: "❓ Category \"{categoryName}\" not found. Check the category list in the *help* menu.",
    ERROR_INSUFFICIENT_BALANCE: (effectiveBalance, newNominal) => `⚠️ *Transaction Failed!*\n\nYour balance is insufficient.\n\n` + `💰 Current Balance: *${effectiveBalance}*\n💸 Expense: *${newNominal}*`,
    ERROR_EDIT_INSUFFICIENT_BALANCE: (effectiveBalance, newNominal) => `⚠️ *Edit Failed!*\nBalance is insufficient for the new amount.\n\n`+ `Effective Balance: *${effectiveBalance}*\n` + `New Amount: *${newNominal}*`,
    ERROR_INTERNAL: "🤖💥 Oops, a little technical glitch occurred on my system. Please try again in a moment.",
    ERROR_INVALID_PERIOD: "❌ Period \"{period}\" is not valid. Choose between: daily, weekly, monthly, yearly.",
    ERROR_PERIOD_NOT_SPECIFIED: "🤔 The format is incorrect. Use: `check [period]`\nExample: `check daily`",
    ERROR_INVALID_EDIT_CHOICE: "Invalid choice. Please send the number 1, 2, or 3. Type *cancel* to cancel.",
    ERROR_LANGUAGE_NOT_SUPPORTED: "Language not supported. Available options: `id`, `en`."
};