import { 
    IAppAccessors,
    IConfigurationExtend,
    IConfigurationModify,
    IEnvironmentRead,
    IHttp,
    ILogger,
    IModify,
    IPersistence,
    IRead
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IMessage, IPostMessageSent } from '@rocket.chat/apps-engine/definition/messages';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { IRoom, RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import { ISetting } from '@rocket.chat/apps-engine/definition/settings';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { settings } from './settings';
import { MembersCache } from './src/cache/MembersCache';
import { sendMessage } from './src/helpers/helpers';
import { ESettings } from './src/@types/Settings';

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
        }
        this.postRoomName = await environmentRead.getSettings().getValueById('Post_Room_Name');
        if (this.postRoomName) {
            this.postRoom = await this.getAccessors().reader.getRoomReader().getByName(this.postRoomName) as IRoom;
        }
        this.botUsername = await environmentRead.getSettings().getValueById('Bot_Username');
        if (this.botUsername) {
            this.botUser = await this.getAccessors().reader.getUserReader().getByUsername(this.botUsername) as IUser;
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
    public async onSettingUpdated(
        setting: ISetting,
        _configModify: IConfigurationModify,
        _read: IRead,
        _http: IHttp
    ): Promise<void> {
        switch (setting.id) {
            case ESettings.MembersRoomName:
                this.membersRoomName = setting.value;
                if (this.membersRoomName) {
                    this.membersRoom = await this.getAccessors().reader.getRoomReader().getByName(this.membersRoomName) as IRoom;
                }
                break;
            case ESettings.PostRoomName:
                this.postRoomName = setting.value;
                if (this.postRoomName) {
                    this.postRoom = await this.getAccessors().reader.getRoomReader().getByName(this.postRoomName) as IRoom;
                }
                break;
            case ESettings.BotUser:
                this.botUsername = setting.value;
                if (this.botUsername) {
                    this.botUser = await this.getAccessors().reader.getUserReader().getByUsername(this.botUsername) as IUser;
                }
                break;
            case ESettings.BotAlias:
                this.botName = setting.value;
                break;
            case ESettings.BotEmojiAvatar:
                this.botEmojiAvatar = setting.value;
                break;
        }
    }
    public async getSettingValue (id: ESettings) {
        return this.getAccessors().reader
            .getEnvironmentReader()
            .getSettings()
            .getById(id)
    } 

    public async getRoomInfo() {
        const reader = this.getAccessors().reader;
    
        const getRoom = async (roomName: string) => await reader
            .getRoomReader()
            .getByName(roomName);
        
        if (!this.membersRoom) {
            const membersSettingsName = (await this.getSettingValue(ESettings.MembersRoomName)).value;
            this.membersRoom = await getRoom(membersSettingsName) as IRoom;
        }
        const roomMembers = this.membersRoom ? await reader.getRoomReader().getMembers(this.membersRoom.id as string) : [];
    
        if (!this.postRoom) {
            const postRoomName = (await this.getSettingValue(ESettings.PostRoomName)).value;
            this.postRoom = await getRoom(postRoomName) as IRoom;
        }
    
        return {
            membersRoom: this.membersRoom,
            roomMembers,
            postRoom: this.postRoom
        };
    }

    public async getBotInfo() {
        const reader = this.getAccessors().reader;
    
        const getUser = async (username: string) => await reader
            .getUserReader()
            .getByUsername(username);
        
        if (!this.botUsername) {
            this.botUsername = (await this.getSettingValue(ESettings.BotUser)).value;
        }
        let botUser = this.botUser

        if (!botUser) {
            botUser = await getUser(this.botUsername);
        }
    
        if (!this.botName) {
            this.botName = (await this.getSettingValue(ESettings.BotAlias)).value;
        }
        const botAlias = this.botName;
    
        if (!this.botEmojiAvatar) {
            this.botEmojiAvatar = (await this.getSettingValue(ESettings.BotEmojiAvatar)).value;
        }
        const botAvatar = this.botEmojiAvatar;
    
        return {
            botUser,
            botAlias,
            botAvatar
        };
    }

    /**
     * We'll ignore any message that is not a direct message between bot and user
     *
     * @param message
     */
    public async checkPostMessageSent(message: IMessage): Promise<boolean> {
        const { botUser } = await this.getBotInfo()
        const { membersRoom, postRoom } = await this.getRoomInfo()

        return botUser !== undefined &&
            postRoom !== undefined &&
            membersRoom !== undefined &&
            message.room.type === RoomType.DIRECT_MESSAGE && // Only respond to direct messages
            message.sender.id !== botUser.id && // Do not respond to bot self message
            message.room.id.indexOf(botUser.id) !== -1; // Bot has to be part of the direct room
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
    public async executePostMessageSent(
        message: IMessage, 
        _read: IRead,
        _http: IHttp,
        _persistence: IPersistence,
        modify: IModify
    ): Promise<void> {
        const { postRoom, roomMembers } = await this.getRoomInfo()

        if(!postRoom) {
            throw new Error('Unable to find room')
        }

        const member = roomMembers
            .filter((m) => m.username === message.sender.username);
        if (member && member.length > 0) {
            sendMessage(this, modify, postRoom, message.text as string);
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
