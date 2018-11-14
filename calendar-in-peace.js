require('dotenv').load();

const env = process.env;

const Botkit = require('botkit');

const middleware = require('botkit-middleware-watson')({
  username: env.ASSISTANT_USERNAME,
  password: env.ASSISTANT_PASSWORD,
  workspace_id: env.WORKSPACE_ID,
  url: env.ASSISTANT_URL || 'https://gateway.watsonplatform.net/assistant/api',
  version: '2018-07-10'
});

const slackController = Botkit.slackbot({
  clientSigningSecret: env.SLACK_SIGNING_SECRET,
});
slackController.middleware.receive.use(middleware.receive);
const slackBot = slackController.spawn({
  token: env.SLACK_TOKEN
});

let schedules = {};
const defaults = {
  'sys-date'    : 'today',
  'sys-time'    : '12pm',
  'person'  : 'you',
}
const timeout = 300000; // 5min * 60s/min * 1000ms/s

slackController.hears(['.*'], ['direct_message', 'direct_mention', 'mention', 'ambient'], (bot, message) => {
  slackController.log('Slack message received');
  const { watsonError, watsonData, user } = message;
  if (watsonError) {
    console.log(watsonError);
  } else if (watsonData) {
    if (watsonData.intents[0]) {
      const { intent } = watsonData.intents[0];
      if (intent === 'schedule') {
        let valJSON = { 'ts' : message.ts * 1000 };
        for (let entity of watsonData.entities) {
          valJSON[entity.entity] = entity.value;
        }
        for (let name in defaults) {
          valJSON[name] = valJSON[name] || defaults[name];
        }
        schedules[user] = valJSON;
      } else if (intent === 'confirmation') {
        for (let currUser in schedules) {
          if (user !== currUser) {
            const { ts } = schedules[currUser];
            const time = schedules[currUser]['sys-time'];
            const date = schedules[currUser]['sys-date'];
            if (message.ts * 1000 < ts + timeout) {
              bot.reply(message, `Other party has ${watsonData.entities[0].value}ed invite to meeting at ${time} ${date}`);
            } else {
              delete schedules[currUser];
            }
            break;
          }
        }
      }
    }
  } else {
    console.log('Error: received message in unknown format. (Is your connection with Watson Conversation up and running?)');
    bot.reply(message, 'I\'m sorry, but for technical reasons I can\'t respond to your message');
  }
});

slackBot.startRTM();
