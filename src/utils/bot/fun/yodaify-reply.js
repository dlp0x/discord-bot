// utils/yodaify-reply.js
import { isYodaEnabled } from "./yoda-config.js";
import { yodaify } from "./yoda.js";
import { CommandInteraction } from "discord.js";
import logger from '#shared/logging/logger.js';

export function enableYodaReplyPatch() {
  const originalReply = CommandInteraction.prototype.reply;

  CommandInteraction.prototype.reply = async function (options) {
    try {
      const guildId = this.guild?.id;

      if (guildId && isYodaEnabled(guildId)) {
        if (typeof options === "string") {
          options = yodaify(options);
        } else if (options?.content) {
          options.content = yodaify(options.content);
        }
      }

      return originalReply.call(this, options);
    } catch (err) {
      logger.error("💥 Yoda reply patch error:", err);
      return originalReply.call(this, options);
    }
  };
}

