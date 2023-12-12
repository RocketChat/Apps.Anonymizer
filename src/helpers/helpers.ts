import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessageAttachment } from '@rocket.chat/apps-engine/definition/messages';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { Anonymizer } from '../../AnonymizerApp';
import { MembersCache } from '../cache/MembersCache';

/**
 * Gets users of room defined by room id setting
 * Uses simple caching for avoiding repeated database queries
 *
 * @param app
 * @param read
 * @returns array of users
 */
export async function getMembers(app: Anonymizer): Promise<Array<IUser>> {
    // Gets cached members if expire date is still valid
    if (app.membersCache && app.membersCache.isValid()) {
        return app.membersCache.members;
    }
    let members;
    if (app.membersRoom) {
        try {
            members = (await app.getRoomInfo()).roomMembers;
        } catch (error) {
            app.getLogger().log(error);
        }
        app.membersCache = new MembersCache(members);
    }
    return members || [];
}

/**
 * Sends a message using bot
 *
 * @param app
 * @param modify
 * @param room Where to send message to
 * @param message What to send
 * @param attachments (optional) Message attachments (such as action buttons)
 */
export async function sendMessage(app: Anonymizer, modify: IModify, room: IRoom, message: string, attachments?: Array<IMessageAttachment>): Promise<void> {
    const msg = modify.getCreator().startMessage()
        .setGroupable(false)
        .setSender(app.botUser)
        .setUsernameAlias(app.botName)
        .setEmojiAvatar(app.botEmojiAvatar)
        .setText(message)
        .setRoom(room);
    if (attachments && attachments.length > 0) {
        msg.setAttachments(attachments);
    }
    try {
        await modify.getCreator().finish(msg);
    } catch (error) {
        app.getLogger().log(error);
    }
}
