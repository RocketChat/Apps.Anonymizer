import { IAppAccessors, IConfigurationExtend, IConfigurationModify, IEnvironmentRead, IHttp, ILogger, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IMessage, IPostMessageSent } from '@rocket.chat/apps-engine/definition/messages';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { IRoom, RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import { ISetting } from '@rocket.chat/apps-engine/definition/settings';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { getMembers, sendMessage } from './helpers';
import { MembersCache } from './MembersCache';
import { settings } from './settings';

export class Anonymizer extends App implements IPostMessageSent {
    /**
     * The bot username alias
     */
    public botName: string = 'Anonymizer';

    /**
     * The bot avatar
     */
    public botEmojiAvatar: string = ':bust_in_silhouette:';

    /**
     * The room name where to get members from
     */
    public membersRoomName: string;

    /**
     * The actual room object where to get members from
     */
    public membersRoom: IRoom;

    /**
     * The room name where to post messages to
     */
    public postRoomName: string;

    /**
     * The room name where to post messages to
     */
    public postRoom: IRoom;

    /**
     * The bot username who sends the messages
     */
    public botUsername: string;

    /**
     * The bot user sending messages
     */
    public botUser: IUser;

    /**
     * Members cache
     */
    // tslint:disable-next-line:variable-name
    private _membersCache: MembersCache;

    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    /**
     * Loads the room where to get members from
     * Loads the room where to post messages to
     * Loads the user who'll be posting messages as the botUser
     *
     * @param environmentRead
     * @param configModify
     */
    public async onEnable(environmentRead: IEnvironmentRead, configModify: IConfigurationModify): Promise<boolean> {
        this.membersRoomName = await environmentRead.getSettings().getValueById('Members_Room_Name');
        if (this.membersRoomName) {
            this.membersRoom = await this.getAccessors().reader.getRoomReader().getByName(this.membersRoomName) as IRoom;
        } else {
            return false;
        }
        this.postRoomName = await environmentRead.getSettings().getValueById('Post_Room_Name');
        if (this.postRoomName) {
            this.postRoom = await this.getAccessors().reader.getRoomReader().getByName(this.postRoomName) as IRoom;
        } else {
            return false;
        }
        this.botUsername = await environmentRead.getSettings().getValueById('Bot_Username');
        if (this.botUsername) {
            this.botUser = await this.getAccessors().reader.getUserReader().getByUsername(this.botUsername) as IUser;
        } else {
            return false;
        }
        return true;
    }

    /**
     * Updates room ids for members and messages when settings are updated
     *
     * @param setting
     * @param configModify
     * @param read
     * @param http
     */
    public async onSettingUpdated(setting: ISetting, configModify: IConfigurationModify, read: IRead, http: IHttp): Promise<void> {
        switch (setting.id) {
            case 'Members_Room_Name':
                this.membersRoomName = setting.value;
                if (this.membersRoomName) {
                    this.membersRoom = await this.getAccessors().reader.getRoomReader().getByName(this.membersRoomName) as IRoom;
                }
                break;
            case 'Post_Room_Name':
                this.postRoomName = setting.value;
                if (this.postRoomName) {
                    this.postRoom = await this.getAccessors().reader.getRoomReader().getByName(this.postRoomName) as IRoom;
                }
                break;
            case 'Bot_User':
                this.botUsername = setting.value;
                if (this.botUsername) {
                    this.botUser = await this.getAccessors().reader.getUserReader().getByUsername(this.botUsername) as IUser;
                }
                break;
            case 'Bot_Alias':
                this.botName = setting.value;
                break;
            case 'Bot_Emoji_Avatar':
                this.botEmojiAvatar = setting.value;
                break;
        }
    }

    /**
     * We'll ignore any message that is not a direct message between bot and user
     *
     * @param message
     */
    public async checkPostMessageSent(message: IMessage): Promise<boolean> {
        return this.botUser !== undefined &&
            this.postRoom !== undefined &&
            this.membersRoom !== undefined &&
            message.room.type === RoomType.DIRECT_MESSAGE && // Only respond to direct messages
            message.sender.id !== this.botUser.id && // Do not respond to bot self message
            message.room.id.indexOf(this.botUser.id) !== -1; // Bot has to be part of the direct room
    }

    /**
     * Checks if we are listening for anything in bot's direct room
     *
     * @param message
     * @param read
     * @param http
     * @param persistence
     * @param modify
     */
    public async executePostMessageSent(message: IMessage, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<void> {
        const member = (await getMembers(this, read))
            .filter((m) => m.username === message.sender.username);
        if (member && member.length > 0) {
            sendMessage(this, modify, this.postRoom, message.text as string);
        } else {
            console.log(member);
        }
    }

    protected async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
        // Settings
        await Promise.all(settings.map((setting) => configuration.settings.provideSetting(setting)));
    }

    get membersCache(): MembersCache {
        return this._membersCache;
    }

    set membersCache(memberCache: MembersCache) {
        this._membersCache = memberCache;
    }
}
