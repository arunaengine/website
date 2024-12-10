<script lang="ts" setup>
import {
  IconArchive,
    IconArchiveOff,
    IconCornerUpLeft,
    IconCornerUpLeftDouble,
    IconCornerUpRight,
    IconDotsVertical,
    IconTrash
} from "@tabler/icons-vue";

import {format} from 'date-fns/format'
import type { Mail, Notification } from './data-notifications'
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu'
import {Avatar, AvatarFallback} from '@/components/ui/avatar'
import {Button} from '@/components/ui/button'
import {Separator} from '@/components/ui/separator'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {v2PersonalNotificationVariant} from "~/composables/aruna_api_json";

interface MailDisplayProps {
  mail: Notification | undefined //Mail | undefined
}

const props = defineProps<MailDisplayProps>()

const mailFallbackName = computed(() => {
  return 'A' //ToDo
  /*
  return props.mail?.name
      .split(' ')
      .map(chunk => chunk[0])
      .join('')
  */
})

const today = new Date()

function displayVariant(variant: v2PersonalNotificationVariant) {
  const label = variant.replace('PERSONAL_NOTIFICATION_VARIANT_', '').replace('_', ' ').toLowerCase()
  return label.charAt(0).toUpperCase() + label.slice(1)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex items-center p-2">
      <div class="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon" :disabled="!mail">
              <IconArchive class="size-4"/>
              <span class="sr-only">Archive</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Archive</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon" :disabled="!mail">
              <IconArchiveOff class="size-4"/>
              <span class="sr-only">Move to junk</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Move to junk</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon" :disabled="!mail">
              <IconTrash class="size-4"/>
              <span class="sr-only">Move to trash</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Move to trash</TooltipContent>
        </Tooltip>
        <!--
        <Separator orientation="vertical" class="mx-1 h-6" />
        <Tooltip>
          <Popover>
            <PopoverTrigger as-child>
              <TooltipTrigger as-child>
                <Button variant="ghost" size="icon" :disabled="!mail">
                  <Clock class="size-4" />
                  <span class="sr-only">Snooze</span>
                </Button>
              </TooltipTrigger>
            </PopoverTrigger>
            <PopoverContent class="flex w-[535px] p-0">
              <div class="flex flex-col gap-2 border-r px-2 py-4">
                <div class="px-4 text-sm font-medium">
                  Snooze until
                </div>
                <div class="grid min-w-[250px] gap-1">
                  <Button
                      variant="ghost"
                      class="justify-start font-normal"
                  >
                    Later today
                    <span class="ml-auto text-muted-foreground">
                      {{ format(addHours(today, 4), "E, h:m b") }}
                    </span>
                  </Button>
                  <Button
                      variant="ghost"
                      class="justify-start font-normal"
                  >
                    Tomorrow
                    <span class="ml-auto text-muted-foreground">
                      {{ format(addDays(today, 1), "E, h:m b") }}
                    </span>
                  </Button>
                  <Button
                      variant="ghost"
                      class="justify-start font-normal"
                  >
                    This weekend
                    <span class="ml-auto text-muted-foreground">
                      {{ format(nextSaturday(today), "E, h:m b") }}
                    </span>
                  </Button>
                  <Button
                      variant="ghost"
                      class="justify-start font-normal"
                  >
                    Next week
                    <span class="ml-auto text-muted-foreground">
                      {{ format(addDays(today, 7), "E, h:m b") }}
                    </span>
                  </Button>
                </div>
              </div>
              <div class="p-2">
                <Calendar />
              </div>
            </PopoverContent>
          </Popover>
          <TooltipContent>Snooze</TooltipContent>
        </Tooltip>
        -->
      </div>
      <div class="ml-auto flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon" :disabled="!mail">
              <IconCornerUpLeft class="size-4"/>
              <span class="sr-only">Reply</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reply</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon" :disabled="!mail">
              <IconCornerUpLeftDouble class="size-4"/>
              <span class="sr-only">Reply all</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reply all</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon" :disabled="!mail">
              <IconCornerUpRight class="size-4"/>
              <span class="sr-only">Forward</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Forward</TooltipContent>
        </Tooltip>
      </div>
      <Separator orientation="vertical" class="mx-2 h-6"/>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon" :disabled="!mail">
            <IconDotsVertical class="size-4"/>
            <span class="sr-only">More</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Mark as unread</DropdownMenuItem>
          <DropdownMenuItem>Star thread</DropdownMenuItem>
          <DropdownMenuItem>Add label</DropdownMenuItem>
          <DropdownMenuItem>Mute thread</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <Separator/>
    <div v-if="mail" class="flex flex-1 flex-col">
      <div class="flex items-start p-4">
        <div class="flex items-start gap-4 text-sm">
          <Avatar>
            <AvatarFallback>
              {{ mailFallbackName }}
            </AvatarFallback>
          </Avatar>
          <div class="grid gap-1">
            <div class="font-semibold">
              {{ mail.from }}
              <!--{{ mail.name || 'Aruna System' }}-->
            </div>
            <div class="line-clamp-1 text-xs">
              {{ displayVariant(mail.variant) }}
              <!--{{ mail.subject }}-->
            </div>
            <div class="line-clamp-1 text-xs">
              <span class="font-medium">Reply-To:</span>
              {{ 'some-mail.email.com' }}
              <!--{{ mail.email }}-->
            </div>
          </div>
        </div>
        <div v-if="mail.date" class="ml-auto text-xs text-muted-foreground">
          {{ format(new Date(mail.date), "PPpp") }}
        </div>
      </div>

      <Separator/>
      <div class="flex-1 whitespace-pre-wrap p-4 text-sm">
        {{ mail.message }}
        <!--{{ mail.text }}-->
      </div>
      <!--
      <Separator class="mt-auto"/>
      <div class="p-4">
        <form>
          <div class="grid gap-4">
            <Textarea class="p-4"
                      :placeholder="`Reply ${mail.name}...`"/>
            <div class="flex items-center">
              <Label html-for="mute"
                     class="flex items-center gap-2 text-xs font-normal">
                <Switch id="mute" aria-label="Mute thread"/>
                Mute this thread
              </Label>
              <Button type="button"
                      size="sm"
                      class="ml-auto">
                Send
              </Button>
            </div>
          </div>
        </form>
      </div>
      -->
    </div>
    <div v-else class="p-8 text-center text-muted-foreground">
      No message selected
    </div>
  </div>
</template>