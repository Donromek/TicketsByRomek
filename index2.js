const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, 
    ModalBuilder, TextInputBuilder, TextInputStyle, 
    PermissionFlagsBits, ChannelType, REST, Routes, SlashCommandBuilder
} = require('discord.js');
const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const ticketData = new Map();

// Rejestracja komendy /setup-tickets
client.on('ready', async () => {
    console.log(`🔥 Bot D1ablik Exchange uruchomiony jako ${client.user.tag}!`);

    const commands = [
        new SlashCommandBuilder()
            .setName('setup-tickets')
            .setDescription('Wysyła panel otwierania ticketów exchange')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ];

    const rest = new REST({ version: '10' }).setToken(config.token);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Komenda /setup-tickets została zarejestrowana!');
    } catch (err) {
        console.error('Błąd rejestracji komend:', err);
    }
});

client.on('interactionCreate', async interaction => {
    // 1. Postawienie panelu ticketów
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup-tickets') {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🔥 D1ABLIK EXCHANGE × OTWÓRZ TICKET')
            .setDescription('Wybierz z poniższego menu opcje wymiany, aby otworzyć zgłoszenie!')
            .setFooter({ text: 'D1ABLIK STORE' });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_type_select')
            .setPlaceholder('👉 Wybierz kierunek wymiany...')
            .addOptions([
                { label: 'Przenoszę z SKY na LF', value: 'sky_to_lf', description: 'Z: SKY ➔ Do: LF', emoji: '🔄' },
                { label: 'Przenoszę z LF na SKY', value: 'lf_to_sky', description: 'Z: LF ➔ Do: SKY', emoji: '🔄' }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ PANEL TICKETÓW WYSŁANY!', ephemeral: true });
    }

    // 2. Otwarcie nowego ticketa po wyborze opcji
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type_select') {
        const val = interaction.values[0];
        let z = val === 'lf_to_sky' ? 'LF' : 'SKY';
        let do_kanal = val === 'lf_to_sky' ? 'SKY' : 'LF';

        const channel = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: config.ticketCategoryId,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                { id: config.adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
            ]
        });

        ticketData.set(channel.id, {
            klientId: interaction.user.id,
            z: z,
            do: do_kanal
        });

        const closeBtn = new ButtonBuilder()
            .setCustomId('close_ticket_btn')
            .setLabel('🔒 Zamknij i Wystaw Legit Check')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(closeBtn);

        const embedTicket = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle(`🎟 TICKET WYMIANY — ${interaction.user.username}`)
            .setDescription(`Witaj ${interaction.user}!\n\n**Zadeklarowana wymiana:**\n• **Wymieniono z:** \`${z}\`\n• **Otrzymano na:** \`${do_kanal}\`\n\nPo zakończonej transakcji realizator kliknie przycisk poniżej.`);

        await channel.send({ content: `${interaction.user} | <@&${config.adminRoleId}>`, embeds: [embedTicket], components: [row] });
        await interaction.reply({ content: `✅ Stworzono ticket: ${channel}`, ephemeral: true });
    }

    // 3. Kliknięcie zamknij -> Pokazanie formularza (Modal)
    if (interaction.isButton() && interaction.customId === 'close_ticket_btn') {
        if (!interaction.member.roles.cache.has(config.adminRoleId) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Tylko realizator może zamknąć ten ticket!', ephemeral: true });
        }

        const data = ticketData.get(interaction.channel.id) || { z: 'SKY', do: 'LF' };

        const modal = new ModalBuilder()
            .setCustomId('close_ticket_modal')
            .setTitle('Finalizacja Wymiany');

        const inputZ = new TextInputBuilder()
            .setCustomId('input_z')
            .setLabel('Wymieniono z')
            .setValue(data.z)
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const inputDo = new TextInputBuilder()
            .setCustomId('input_do')
            .setLabel('Otrzymano na')
            .setValue(data.do)
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const inputWartosc = new TextInputBuilder()
            .setCustomId('input_wartosc')
            .setLabel('Wartość wymiany (np. 126k)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const inputNumer = new TextInputBuilder()
            .setCustomId('input_numer')
            .setLabel('Numer LC (np. 120)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(inputZ),
            new ActionRowBuilder().addComponents(inputDo),
            new ActionRowBuilder().addComponents(inputWartosc),
            new ActionRowBuilder().addComponents(inputNumer)
        );

        await interaction.showModal(modal);
    }

    // 4. Wysyłanie Legit Checka i usuwanie ticketa
    if (interaction.isModalSubmit() && interaction.customId === 'close_ticket_modal') {
        const z = interaction.fields.getTextInputValue('input_z');
        const do_kanal = interaction.fields.getTextInputValue('input_do');
        const wartosc = interaction.fields.getTextInputValue('input_wartosc');
        const numer = interaction.fields.getTextInputValue('input_numer');

        const data = ticketData.get(interaction.channel.id);
        const klientId = data ? data.klientId : interaction.user.id;
        const klientUser = await client.users.fetch(klientId).catch(() => interaction.user);

        const lcChannel = interaction.guild.channels.cache.get(config.legitCheckChannelId);

        const lcEmbed = new EmbedBuilder()
            .setColor('#57F287')
            .setTitle(`✅ D1ABLIK EXCHANGE × LEGIT CHECK #${numer}`)
            .setDescription(`🤝 **Pomyślnie zrealizowano kolejną transakcję!** (${numer} LC)\n\u200B`)
            .addFields(
                { name: '👤 Klient', value: `<@${klientUser.id}> (\`${klientUser.username}\`)`, inline: false },
                { name: '🛡 Realizator (Trader)', value: `${interaction.user}`, inline: false },
                { name: '\u200B', value: '\u200B', inline: false },
                { name: '🟩 Wymieniono z', value: `\`${z}\``, inline: false },
                { name: '🟪 Otrzymano na', value: `\`${do_kanal}\``, inline: false },
                { name: '💰 Wartość wymiany', value: `\`${wartosc}\``, inline: false }
            )
            .setFooter({ 
                text: `D1ABLIK EXCHANGE • 2026 • LC #${numer}`,
                iconURL: interaction.guild.iconURL()
            })
            .setTimestamp();

        if (lcChannel) {
            await lcChannel.send({ 
                content: `⭐ *Dziękujemy za skorzystanie z usług D1ablik Exchange!*`,
                embeds: [lcEmbed] 
            });
        }

        await interaction.reply({ content: '✅ Legit Check wysłany! Usunięcie kanału za 5 sek...' });

        setTimeout(() => {
            interaction.channel.delete().catch(() => {});
        }, 5000);
    }
});

client.login(config.token);
