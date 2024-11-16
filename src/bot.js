const express = require('express');
const { Telegraf } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Initialize express app
const app = express();
const port = process.env.PORT || 3000;

// Initialize bot
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

// Basic route for health check
app.get('/', (req, res) => {
  res.send('Bot is running!');
});

// Webhook route for Telegram
app.use(bot.webhookCallback('/webhook'));

// Your existing bot code
bot.start((ctx) => ctx.reply('Send me a topic to generate MCQs in poll format.'));

bot.on('text', async (ctx) => {
  const topic = ctx.message.text;
  const prompt = `Generate multiple choice questions on ${topic} in the format:

  1. Question text
     a) Option 1
     b) Option 2
     c) Option 3
     d) Option 4
     Answer: a

  Only provide questions and answers in this specific format and options length must not exceed 100.`;

  try {
    const result = await model.generateContent(prompt);
    const mcqText = result.response.text();
    console.log("MCQ Text:", mcqText);

    const questions = parseMCQs(mcqText);
    console.log("Parsed Questions:", questions);

    if (!questions.length) {
      await ctx.reply("No questions were generated. Please try a different topic.");
      return;
    }

    for (const question of questions) {
      await ctx.replyWithPoll(
        question.question,
        question.options,
        {
          type: 'quiz',
          correct_option_id: question.answerIndex,
          is_anonymous: true
        }
      );
      console.log("Poll sent for question:", question.question);
    }
  } catch (error) {
    console.error('Error:', error);
    await ctx.reply('An error occurred while processing your request. Please try again later.');
  }
});

// Your existing parseMCQs function
function parseMCQs(mcqText) {
  const questions = [];
  const lines = mcqText.split('\n').filter(line => line.trim() !== '');
  
  let currentQuestion = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.match(/^\d+\.|^\*\*\d+\./)) {
      if (currentQuestion && currentQuestion.options.length > 0) {
        questions.push(currentQuestion);
      }
      
      const questionText = line.replace(/^\d+\.\s*\*\*|\*\*$|^\*\*|\d+\.\s*/g, '').trim();
      currentQuestion = {
        question: questionText,
        options: [],
        answerIndex: null
      };
    }
    else if (line.match(/^[a-d]\)/)) {
      if (currentQuestion) {
        const optionText = line.replace(/^[a-d]\)\s*/, '').trim();
        currentQuestion.options.push(optionText);
      }
    }
    else if (line.match(/^Answer:|^\*\*Answer:/i)) {
      if (currentQuestion) {
        const answerMatch = line.match(/[a-d](?:\*\*)?$/);
        if (answerMatch) {
          const answer = answerMatch[0].replace(/\*\*$/g, '');
          currentQuestion.answerIndex = ['a', 'b', 'c', 'd'].indexOf(answer.toLowerCase());
        }
      }
    }
  }
  
  if (currentQuestion && currentQuestion.options.length > 0) {
    questions.push(currentQuestion);
  }
  
  return questions;
}

// Set webhook in production, use polling in development
if (process.env.NODE_ENV === 'production') {
  // Set the webhook
  bot.telegram.setWebhook(`${process.env.RENDER_EXTERNAL_URL}/webhook`);
} else {
  // Start bot with polling in development
  bot.launch();
}

// Start express server
app.listen(port, () => {
  console.log(`Bot server is running on port ${port}`);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));