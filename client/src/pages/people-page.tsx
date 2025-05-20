import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { RelationshipType, Person as PersonType } from "@shared/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MoreVertical, Plus, Mail, Phone, Star, Edit, Trash } from "lucide-react";
import { format } from "date-fns";
import { Badge, BadgeVariant } from "@/components/ui/badge";
import { AddPersonDialog } from "@/components/add-person-dialog";
import { EditPersonDialog } from "@/components/edit-person-dialog";
import { VerificationDialog } from "@/components/verification-dialog";

// Use the Person type from shared schema
// Override ContactPreference to be more specific than the string in the DB type
type ContactPreference = "sms" | "whatsapp";
type Person = PersonType & {
  contactPreference: ContactPreference;
  relationship: keyof typeof RelationshipType;
};

export default function PeoplePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [emailVerifyDialogOpen, setEmailVerifyDialogOpen] = useState(false);
  const [phoneVerifyDialogOpen, setPhoneVerifyDialogOpen] = useState(false);

  // Fetch people
  const {
    data: people = [] as Person[],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['/api/people'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/people');
      if (!res.ok) {
        throw new Error('Failed to fetch people');
      }
      return res.json() as Promise<Person[]>;
    },
  });

  // Delete person mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/people/${id}`);
      if (!res.ok) {
        throw new Error('Failed to delete person');
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/people'] });
      toast({
        title: 'Person deleted',
        description: 'The person has been removed from your contacts',
      });
      setIsDeleteDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete person',
        variant: 'destructive',
      });
    },
  });

  // Initiate email verification mutation
  const initiateEmailVerificationMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/people/${id}/verify-email`);
      if (!res.ok) {
        throw new Error('Failed to send verification email');
      }
      return true;
    },
    onSuccess: () => {
      toast({
        title: 'Verification sent',
        description: 'A verification code has been sent to the person\'s email',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send verification email',
        variant: 'destructive',
      });
    },
  });

  // Initiate phone verification mutation
  const initiatePhoneVerificationMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/people/${id}/verify-phone`);
      if (!res.ok) {
        throw new Error('Failed to send verification message');
      }
      return true;
    },
    onSuccess: () => {
      toast({
        title: 'Verification sent',
        description: 'A verification code has been sent to the person\'s phone',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send verification message',
        variant: 'destructive',
      });
    },
  });

  // Verify email mutation
  const verifyEmailMutation = useMutation({
    mutationFn: async ({ id, code }: { id: number; code: string }) => {
      const res = await apiRequest('POST', `/api/people/${id}/confirm-email`, { code });
      if (!res.ok) {
        throw new Error('Failed to verify email');
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/people'] });
      toast({
        title: 'Success',
        description: 'Email verification completed successfully',
      });
      setEmailVerifyDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to verify email',
        variant: 'destructive',
      });
    },
  });

  // Verify phone mutation
  const verifyPhoneMutation = useMutation({
    mutationFn: async ({ id, code }: { id: number; code: string }) => {
      const res = await apiRequest('POST', `/api/people/${id}/confirm-phone`, { code });
      if (!res.ok) {
        throw new Error('Failed to verify phone');
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/people'] });
      toast({
        title: 'Success',
        description: 'Phone verification completed successfully',
      });
      setPhoneVerifyDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to verify phone',
        variant: 'destructive',
      });
    },
  });

  const handleStartEmailVerification = (person: Person) => {
    setSelectedPerson(person);
    initiateEmailVerificationMutation.mutate(person.id);
    setEmailVerifyDialogOpen(true);
  };

  const handleStartPhoneVerification = (person: Person) => {
    setSelectedPerson(person);
    initiatePhoneVerificationMutation.mutate(person.id);
    setPhoneVerifyDialogOpen(true);
  };

  const handleVerifyEmail = (code?: string) => {
    if (!code) return;
    if (selectedPerson) {
      verifyEmailMutation.mutate({ id: selectedPerson.id, code });
    }
  };

  const handleVerifyPhone = (code?: string) => {
    if (!code) return;
    if (selectedPerson) {
      verifyPhoneMutation.mutate({ id: selectedPerson.id, code });
    }
  };

  const formatPhoneNumber = (phone: string | null) => {
    if (!phone) return '-';
    return phone;
  };

  const getRelationshipLabel = (relationship: string) => {
    switch (relationship) {
      case 'family':
        return 'Family';
      case 'friend':
        return 'Friend';
      case 'colleague':
        return 'Colleague';
      case 'significant_other':
        return 'Significant Other';
      case 'acquaintance':
        return 'Acquaintance';
      case 'other':
        return 'Other';
      default:
        return relationship;
    }
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">People</h1>
          <p className="text-muted-foreground">
            Manage people in your life that Kona can help you interact with
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Person
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your People</CardTitle>
          <CardDescription>
            People you've added to Kona. You can ask Kona to send them messages or reminders.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : isError ? (
            <div className="py-8 text-center">
              <p className="text-destructive">
                Error loading people: {error instanceof Error ? error.message : 'Unknown error'}
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/people'] })}
              >
                Try Again
              </Button>
            </div>
          ) : people.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">
                You haven't added any people yet. Click "Add Person" to get started.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact Info</TableHead>
                    <TableHead>Relationship</TableHead>
                    <TableHead>Verification Status</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {people.map((person) => (
                    <TableRow key={person.id}>
                      <TableCell className="font-medium">
                        {person.firstName} {person.lastName || ''}
                        {person.nickname && <span className="text-muted-foreground"> ({person.nickname})</span>}
                      </TableCell>
                      <TableCell>
                        {person.email && (
                          <div className="flex items-center gap-1 mb-1">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span>{person.email}</span>
                          </div>
                        )}
                        {person.phoneNumber && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span>{formatPhoneNumber(person.phoneNumber)}</span>
                            {person.contactPreference === 'whatsapp' && (
                              <Badge variant="outline" className="ml-1">WhatsApp</Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {getRelationshipLabel(person.relationship)}
                        {person.relationshipDetails && (
                          <div className="text-xs text-muted-foreground">{person.relationshipDetails}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {person.email && (
                            <div className="flex items-center gap-1">
                              <Badge variant={(person.isEmailVerified ? "success" : "secondary") as BadgeVariant}>
                                {person.isEmailVerified ? 'Email ✓' : 'Email Unverified'}
                              </Badge>
                              {!person.isEmailVerified && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-2"
                                  onClick={() => handleStartEmailVerification(person)}
                                >
                                  Verify
                                </Button>
                              )}
                            </div>
                          )}
                          {person.phoneNumber && (
                            <div className="flex items-center gap-1">
                              <Badge variant={(person.isPhoneVerified ? "success" : "secondary") as BadgeVariant}>
                                {person.isPhoneVerified ? 'Phone ✓' : 'Phone Unverified'}
                              </Badge>
                              {!person.isPhoneVerified && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-2"
                                  onClick={() => handleStartPhoneVerification(person)}
                                >
                                  Verify
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedPerson(person);
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            {person.email && !person.isEmailVerified && (
                              <DropdownMenuItem onClick={() => handleStartEmailVerification(person)}>
                                <Mail className="h-4 w-4 mr-2" /> Verify Email
                              </DropdownMenuItem>
                            )}
                            {person.phoneNumber && !person.isPhoneVerified && (
                              <DropdownMenuItem onClick={() => handleStartPhoneVerification(person)}>
                                <Phone className="h-4 w-4 mr-2" /> Verify Phone
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                setSelectedPerson(person);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <Trash className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Person Dialog */}
      <AddPersonDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/people'] });
        }}
      />

      {/* Edit Person Dialog */}
      {selectedPerson && (
        <EditPersonDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          person={selectedPerson}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['/api/people'] });
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {selectedPerson?.firstName} {selectedPerson?.lastName} from your contacts.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedPerson) {
                  deleteMutation.mutate(selectedPerson.id);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Email Verification Dialog */}
      {selectedPerson && (
        <VerificationDialog
          open={emailVerifyDialogOpen}
          onOpenChange={setEmailVerifyDialogOpen}
          title="Verify Email"
          description={`Please enter the verification code sent to ${selectedPerson.email}`}
          onSuccess={handleVerifyEmail}
          type="email"
          isPending={verifyEmailMutation.isPending}
        />
      )}

      {/* Phone Verification Dialog */}
      {selectedPerson && (
        <VerificationDialog
          open={phoneVerifyDialogOpen}
          onOpenChange={setPhoneVerifyDialogOpen}
          title="Verify Phone Number"
          description={`Please enter the verification code sent to ${selectedPerson.phoneNumber}`}
          onSuccess={handleVerifyPhone}
          type="phone"
          isPending={verifyPhoneMutation.isPending}
        />
      )}
    </div>
  );
}