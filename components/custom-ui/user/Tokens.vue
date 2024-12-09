<script setup lang="ts">
import {deleteUserToken} from "~/composables/api_wrapper";
import EventBus from "~/composables/EventBus";
import TokenDialog from "~/components/custom-ui/dialog/TokenDialog.vue";
import {useToast} from "~/components/ui/toast";
import {IconTrash} from "@tabler/icons-vue";
import {DateFormatter} from "@internationalized/date";
import {Scope} from "~/types/aruna-v3-enums";

// DateFormatter for token expiry dates
const df = new DateFormatter((navigator && navigator.language) || "de-DE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
})

/* ----- Properties ----- */
interface TokensProps {
  tokens: Token[],
}

const props = defineProps<TokensProps>()
const tokens = toRef(() => props.tokens)
const personalTokens: Ref<Token[]> = ref([])
const scopedTokens: Ref<Token[]> = ref([])
watchEffect(() => {
  personalTokens.value = scopedTokens.value = [] // Yeah. Don't do that.
  for (const token of tokens.value) {
    if (token.scope === Scope.Personal)
      personalTokens.value.push(token)
    else
      scopedTokens.value.push(token)
  }
})
/* ----- End Properties ----- */

const {toast} = useToast();
const dialogOpen = ref<boolean>(false)

async function deleteToken(tokenId?: string) {
  if (!tokenId) {
    toast({
      title: 'Warning',
      description: 'Provided token id is empty or undefined.'
    })
    return
  }

  await deleteUserToken(tokenId)
  EventBus.emit("updateUser")
}

// Update tokens on component activation
onActivated(() => EventBus.emit('updateTokens'))
</script>
<template>
  <div class="m-4 p-4 flex flex-col w-full lg:max-w-screen-xl lg:mx-auto gap-y-6 rounded-sm border border-dashed border-aruna-text/50">
    <Table>
      <TableCaption class="bg-aruna-muted p-2 text-lg text-aruna-text-accent">A list of your personal Aruna access tokens.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead class="text-lg">Id</TableHead>
          <TableHead class="text-lg">Name</TableHead>
          <TableHead class="text-lg">Scope</TableHead>
          <TableHead class="text-lg">Expiry Date</TableHead>
          <TableHead class="text-lg">Default Group</TableHead>
          <TableHead class="text-lg">Default Realm</TableHead>
          <TableHead class="text-lg">Component Id</TableHead>

          <TableHead class="text-lg text-center">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="token in tokens" :key="token.id">
          <TableCell class="font-medium">{{ token.id }}</TableCell>
          <TableCell>{{ token.name }}</TableCell>
          <TableCell>
            {{ token.createdAt ? df.format(new Date(token.createdAt)) : 'Creation date is undefined' }}
          </TableCell>
          <TableCell>
            {{ token.expiresAt ? df.format(new Date(token.expiresAt)) : 'Expiry date is undefined' }}
          </TableCell>
          <TableCell class="text-center">
            <Button variant="outline"
                    class="p-2 hover:bg-red-400"
                    @click="deleteToken(token.id)">
              <IconTrash/>
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <div class="w-full flex justify-end">
      <Button @click="dialogOpen = true"
              variant="outline"
              class="mt-2 bg-transparent border-aruna-highlight text-aruna-highlight hover:hover:bg-aruna-highlight hover:text-aruna-text-accent rounded-sm">
        Create Token
      </Button>
    </div>
  </div>

  <TokenDialog :initial-open="dialogOpen"
               :with-button="false"
               @update:open="dialogOpen = false"/>
</template>